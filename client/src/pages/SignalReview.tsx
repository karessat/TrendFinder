import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSignals } from '../hooks/useSignals';
import { useTrends } from '../hooks/useTrends';
import { useProcessingStatus } from '../hooks/useProcessingStatus';
import { trendsApi } from '../services/api';
import { SimilarSignalsList } from '../components/signals/SimilarSignalsList';
import { ArchiveSignalModal } from '../components/signals/ArchiveSignalModal';
import { ConfirmTrendCreationModal } from '../components/signals/ConfirmTrendCreationModal';
import { TrendEditModal } from '../components/trends/TrendEditModal';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Signal, Trend, UpdateTrendRequest } from '../types';
import { Layout } from '../components/common/Layout';

export default function SignalReview() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [isCreatingTrend, setIsCreatingTrend] = useState(false);
  const [archivingSignal, setArchivingSignal] = useState<Signal | null>(null);
  const [editingTrend, setEditingTrend] = useState<Trend | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const hasLoadedInitialSignal = useRef(false);

  const {
    nextUnassigned,
    isLoading: signalsLoading,
    error: signalsError,
    loadNextUnassigned,
    updateSignal
  } = useSignals(projectId || '');

  const {
    createTrend,
    updateTrend,
    regenerateSummary,
    isLoading: trendsLoading
  } = useTrends(projectId || '');

  // Check processing status to ensure processing is complete
  const { status: processingStatus, isLoading: processingStatusLoading } = useProcessingStatus(projectId || '', !!projectId);

  // Check if processing is complete (or in error state where review is still possible)
  const isProcessingComplete = () => {
    if (!processingStatus) {
      // If no status yet, wait for it to load
      return false;
    }
    
    // Check explicit status first
    if (processingStatus.status === 'complete' || processingStatus.status === 'error') {
      return true;
    }
    
    // Also check if all phases are actually complete (handles cases where status wasn't updated)
    // This fixes the bug where status might be 'claude_verification' but all work is done
    if (processingStatus.totalSignals > 0) {
      const allEmbeddingsDone = processingStatus.embeddingsComplete >= processingStatus.totalSignals;
      const allSimilaritiesDone = processingStatus.embeddingSimilaritiesComplete >= processingStatus.totalSignals;
      const allVerificationsDone = processingStatus.claudeVerificationsComplete >= processingStatus.totalSignals;
      
      // If all phases are complete, allow access even if status field says otherwise
      if (allEmbeddingsDone && allSimilaritiesDone && allVerificationsDone) {
        return true;
      }
    }
    
    return false;
  };

  // Reset the loaded flag when project changes
  useEffect(() => {
    hasLoadedInitialSignal.current = false;
  }, [projectId]);

  // Load next unassigned signal when ready (only once when processing completes)
  useEffect(() => {
    if (projectId && processingStatus && !processingStatusLoading && !hasLoadedInitialSignal.current && !nextUnassigned) {
      // Check if processing is complete
      let isComplete = processingStatus.status === 'complete' || processingStatus.status === 'error';
      if (!isComplete && processingStatus.totalSignals > 0) {
        const allEmbeddingsDone = processingStatus.embeddingsComplete >= processingStatus.totalSignals;
        const allSimilaritiesDone = processingStatus.embeddingSimilaritiesComplete >= processingStatus.totalSignals;
        const allVerificationsDone = processingStatus.claudeVerificationsComplete >= processingStatus.totalSignals;
        isComplete = allEmbeddingsDone && allSimilaritiesDone && allVerificationsDone;
      }
      
      if (isComplete) {
        console.log('SignalReview - Loading next unassigned signal');
        hasLoadedInitialSignal.current = true;
        loadNextUnassigned();
      }
    }
  }, [projectId, processingStatus, processingStatusLoading, nextUnassigned, loadNextUnassigned]);

  // Redirect if processing is not complete
  useEffect(() => {
    if (projectId && !processingStatusLoading && processingStatus) {
      // Use the same logic as isProcessingComplete
      let isComplete = processingStatus.status === 'complete' || processingStatus.status === 'error';
      
      // Also check if all phases are actually complete
      if (!isComplete && processingStatus.totalSignals > 0) {
        const allEmbeddingsDone = processingStatus.embeddingsComplete >= processingStatus.totalSignals;
        const allSimilaritiesDone = processingStatus.embeddingSimilaritiesComplete >= processingStatus.totalSignals;
        const allVerificationsDone = processingStatus.claudeVerificationsComplete >= processingStatus.totalSignals;
        isComplete = allEmbeddingsDone && allSimilaritiesDone && allVerificationsDone;
      }
      
      if (!isComplete) {
        // Redirect to project dashboard with a message
        navigate(`/projects/${projectId}`, { 
          replace: true,
          state: { message: 'Please wait until processing is complete before reviewing signals.' }
        });
      }
    }
  }, [projectId, processingStatus, processingStatusLoading, navigate]);

  // Show loading state while checking processing status
  if (processingStatusLoading || (processingStatus && !isProcessingComplete())) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600">
              {processingStatusLoading 
                ? 'Checking processing status...' 
                : 'Processing in progress. Redirecting to dashboard...'}
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  const handleCreateTrendClick = () => {
    if (!nextUnassigned?.signal) return;
    // Open confirmation modal instead of immediately creating
    setShowConfirmModal(true);
  };

  const handleConfirmCreateTrend = async () => {
    if (!nextUnassigned?.signal) return;

    setIsCreatingTrend(true);
    try {
      // Prepare signal IDs: current signal + selected similar signals
      const allSignalIds = [nextUnassigned.signal.id, ...selectedSignalIds];
      const trend = await createTrend({ signalIds: allSignalIds });
      if (trend) {
        setSelectedSignalIds([]);
        setIsCreatingTrend(false);
        setShowConfirmModal(false);
        // Open the edit modal with the newly created trend
        setEditingTrend(trend);
      }
    } catch (err) {
      console.error('Failed to create trend:', err);
      setIsCreatingTrend(false);
      // Keep modal open on error so user can retry
      throw err; // Re-throw to let modal handle error display
    }
  };

  const handleSaveTrend = async (id: string, data: UpdateTrendRequest) => {
    await updateTrend(id, data);
    setEditingTrend(null);
    // After saving, load the next unassigned signal
    loadNextUnassigned();
  };

  const handleRegenerateSummary = async (id: string) => {
    if (!projectId || !editingTrend) return;
    
    try {
      // Call the API to regenerate and get the updated trend
      const response = await trendsApi.regenerateSummary(projectId, id);
      // Update the editing trend with the new title and summary
      setEditingTrend({ 
        ...editingTrend, 
        title: response.data.trend.title,
        summary: response.data.trend.summary 
      });
      // Also call the hook to keep the trends list in sync (but it will make another API call)
      // We could optimize this later by passing the updated trend to the hook
      await regenerateSummary(id);
    } catch (err) {
      console.error('Failed to regenerate summary:', err);
      throw err;
    }
  };

  const handleCloseTrendModal = () => {
    setEditingTrend(null);
    // Don't load next signal - stay on current signal when cancelling
  };

  const handleSkip = async () => {
    if (!nextUnassigned?.signal) {
      console.warn('No signal to skip');
      return;
    }
    
    const currentSignalId = nextUnassigned.signal.id;
    setSelectedSignalIds([]);
    try {
      console.log('Skipping signal:', currentSignalId);
      // Pass the current signal ID to exclude it, so we get the next one
      await loadNextUnassigned(currentSignalId);
      console.log('Skip completed, new signal loaded');
    } catch (err) {
      console.error('Failed to skip signal:', err);
      // Show error to user
      if (signalsError) {
        // Error will be displayed by ErrorMessage component
      }
    }
  };

  const handleArchive = () => {
    if (nextUnassigned?.signal) {
      setArchivingSignal(nextUnassigned.signal);
    }
  };

  const handleArchiveConfirm = async (note: string) => {
    if (!archivingSignal) {
      console.error('No signal to archive');
      return;
    }
    
    try {
      // Clear selections first
      setSelectedSignalIds([]);
      const signalIdToArchive = archivingSignal.id;
      setArchivingSignal(null);
      
      // Update the signal status to archived
      const success = await updateSignal(signalIdToArchive, { status: 'Archived', note });
      if (!success) {
        throw new Error('Failed to update signal status');
      }
      
      // Clear the current signal from state since it's now archived
      // The updateSignal hook might have updated nextUnassigned with the archived signal,
      // so we need to clear it and load the next one
      // Archive will remove the signal from unassigned, so load the next one
      // The backend query only returns signals with status = 'unassigned',
      // so archived signals won't appear
      await loadNextUnassigned();
    } catch (err) {
      console.error('Failed to archive signal:', err);
      throw err; // Re-throw so modal can display error
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project not found</h2>
        </div>
      </div>
    );
  }

  if (signalsLoading && !nextUnassigned) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading scan hits...</p>
        </div>
      </div>
    );
  }

  if (!nextUnassigned?.signal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <button
              onClick={() => navigate(`/projects/${projectId}`)}
              className="text-blue-600 hover:text-blue-800 text-lg font-semibold mb-2 inline-block"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Review Scan Hits</h1>
          </div>
          <EmptyState
            title="All scan hits reviewed!"
            message={`You've reviewed all ${nextUnassigned?.remainingCount || 0} unassigned scan hits.`}
            action={{
              label: 'View Trends',
              onClick: () => navigate(`/projects/${projectId}/trends`)
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Review Scan Hits</h1>
              <p className="mt-2 text-gray-600">
                {nextUnassigned.remainingCount} scan hits remaining
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={isCreatingTrend}
              >
                Skip
              </Button>
              {nextUnassigned?.signal && nextUnassigned.signal.status !== 'Archived' && (
                <Button
                  variant="outline"
                  onClick={handleArchive}
                  disabled={isCreatingTrend}
                  title="Archive this scan hit"
                >
                  Archive Scan Hit
                </Button>
              )}
              <Button
                variant="primary"
                onClick={handleCreateTrendClick}
                isLoading={isCreatingTrend || trendsLoading}
                disabled={isCreatingTrend}
                title={selectedSignalIds.length === 0 
                  ? 'Create a trend with this scan hit' 
                  : `Create a trend with ${selectedSignalIds.length + 1} scan hits`}
              >
                {selectedSignalIds.length === 0 
                  ? 'Create Trend' 
                  : `Create Trend (${selectedSignalIds.length + 1} scan hits)`}
              </Button>
            </div>
          </div>
        </div>

        {signalsError && (
          <ErrorMessage
            message={signalsError}
            onDismiss={() => {}}
            className="mb-6"
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Current Scan Hit">
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  {nextUnassigned.signal.status}
                </span>
                {nextUnassigned.signal.trendId && (
                  <Link
                    to={`/projects/${projectId}/trends/${nextUnassigned.signal.trendId}`}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    title="View trend"
                  >
                    In trend: {nextUnassigned.signal.trendId.substring(0, 8)}...
                  </Link>
                )}
              </div>

              {/* Signal Title */}
              {nextUnassigned.signal.title && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {nextUnassigned.signal.title}
                  </h3>
                </div>
              )}

              {/* Signal Description */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-gray-900 font-medium whitespace-pre-wrap">
                  {nextUnassigned.signal.originalText}
                </p>
              </div>

              {/* Signal Source */}
              {nextUnassigned.signal.source && (
                <div>
                  <a 
                    href={nextUnassigned.signal.source} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    View Source
                  </a>
                </div>
              )}

              {/* Signal Note */}
              {nextUnassigned.signal.note && (
                <div className="border-t pt-4">
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 list-none">
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 transform group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Note
                      </span>
                    </summary>
                    <div className="mt-2 p-3 bg-gray-50 rounded text-sm text-gray-700 whitespace-pre-wrap">
                      {nextUnassigned.signal.note}
                    </div>
                  </details>
                </div>
              )}

              {/* Signal ID */}
              <div className="border-t pt-4">
                <div className="text-xs text-gray-500">
                  <strong>Scan Hit ID:</strong> {nextUnassigned.signal.id}
                </div>
              </div>

              {/* Instructions */}
              <div className="border-t pt-4 text-sm text-gray-600">
                Select similar scan hits to the right (including already-reviewed ones) to group them into a trend.
              </div>
            </div>
          </Card>

          <Card>
            <SimilarSignalsList
              signals={nextUnassigned.similarSignals}
              selectedIds={selectedSignalIds}
              onSelectionChange={setSelectedSignalIds}
              showAssigned={true}
              projectId={projectId || ''}
            />
          </Card>
        </div>

        {/* Bottom Navigation */}
        <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => navigate(`/projects/${projectId}/trends`)}
            className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            View Previous Trends →
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="text-blue-600 hover:text-blue-800 text-lg font-semibold transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>

        <ArchiveSignalModal
          signal={archivingSignal}
          isOpen={!!archivingSignal}
          onClose={() => setArchivingSignal(null)}
          onArchive={handleArchiveConfirm}
        />

        {nextUnassigned?.signal && (
          <ConfirmTrendCreationModal
            isOpen={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            currentSignal={nextUnassigned.signal}
            selectedSimilarSignals={nextUnassigned.similarSignals.filter(s => 
              selectedSignalIds.includes(s.id)
            )}
            onConfirm={handleConfirmCreateTrend}
            isCreating={isCreatingTrend}
          />
        )}

        <TrendEditModal
          trend={editingTrend}
          isOpen={!!editingTrend}
          onClose={handleCloseTrendModal}
          onSave={handleSaveTrend}
          onRegenerateSummary={handleRegenerateSummary}
        />
      </div>
    </Layout>
  );
}
