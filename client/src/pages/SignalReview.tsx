import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSignals } from '../hooks/useSignals';
import { useTrends } from '../hooks/useTrends';
import { useProcessingStatus } from '../hooks/useProcessingStatus';
import { SimilarSignalsList } from '../components/signals/SimilarSignalsList';
import { ArchiveSignalModal } from '../components/signals/ArchiveSignalModal';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Signal } from '../types';
import { Layout } from '../components/common/Layout';

export default function SignalReview() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [isCreatingTrend, setIsCreatingTrend] = useState(false);
  const [archivingSignal, setArchivingSignal] = useState<Signal | null>(null);

  const {
    nextUnassigned,
    isLoading: signalsLoading,
    error: signalsError,
    loadNextUnassigned,
    updateSignal
  } = useSignals(projectId || '');

  const {
    createTrend,
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
    // Processing is complete if status is 'complete' or 'error'
    return processingStatus.status === 'complete' || processingStatus.status === 'error';
  };

  // Redirect if processing is not complete
  useEffect(() => {
    if (projectId && !processingStatusLoading && processingStatus) {
      const isComplete = processingStatus.status === 'complete' || processingStatus.status === 'error';
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

  useEffect(() => {
    if (projectId && isProcessingComplete()) {
      console.log('SignalReview - projectId from useParams:', projectId, 'Length:', projectId.length);
      loadNextUnassigned();
    }
  }, [projectId, loadNextUnassigned]);

  const handleCreateTrend = async () => {
    if (!nextUnassigned?.signal || selectedSignalIds.length === 0) return;

    setIsCreatingTrend(true);
    try {
      const allSignalIds = [nextUnassigned.signal.id, ...selectedSignalIds];
      const trend = await createTrend({ signalIds: allSignalIds });
      if (trend) {
        setSelectedSignalIds([]);
        loadNextUnassigned();
      }
    } catch (err) {
      console.error('Failed to create trend:', err);
    } finally {
      setIsCreatingTrend(false);
    }
  };

  const handleCreateSingleSignalTrend = async () => {
    if (!nextUnassigned?.signal) return;

    setIsCreatingTrend(true);
    try {
      const trend = await createTrend({ signalIds: [nextUnassigned.signal.id] });
      if (trend) {
        setSelectedSignalIds([]);
        loadNextUnassigned();
      }
    } catch (err) {
      console.error('Failed to create single-signal trend:', err);
    } finally {
      setIsCreatingTrend(false);
    }
  };

  const handleSkip = () => {
    setSelectedSignalIds([]);
    loadNextUnassigned();
  };

  const handleArchive = () => {
    if (nextUnassigned?.signal) {
      setArchivingSignal(nextUnassigned.signal);
    }
  };

  const handleArchiveConfirm = async (note: string) => {
    if (archivingSignal) {
      await updateSignal(archivingSignal.id, { status: 'Archived', note });
      setArchivingSignal(null);
      // Archive will remove the signal from unassigned, so load the next one
      loadNextUnassigned();
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
          <p className="text-gray-600">Loading signals...</p>
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
              className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Signal Review</h1>
          </div>
          <EmptyState
            title="All signals reviewed!"
            message={`You've reviewed all ${nextUnassigned?.remainingCount || 0} unassigned signals.`}
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
              <h1 className="text-3xl font-bold text-gray-900">Signal Review</h1>
              <p className="mt-2 text-gray-600">
                {nextUnassigned.remainingCount} signals remaining
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
                  title="Archive this signal"
                >
                  Archive Signal
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleCreateSingleSignalTrend}
                isLoading={isCreatingTrend || trendsLoading}
                disabled={isCreatingTrend}
                title="Create a trend with just this signal"
              >
                Create Single-Signal Trend
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateTrend}
                isLoading={isCreatingTrend || trendsLoading}
                disabled={selectedSignalIds.length === 0}
              >
                Create Trend ({selectedSignalIds.length + 1} signals)
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
          <Card title="Current Signal">
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  {nextUnassigned.signal.status}
                </span>
                {nextUnassigned.signal.trendId && (
                  <span className="text-xs text-gray-500">
                    In trend: {nextUnassigned.signal.trendId.substring(0, 8)}...
                  </span>
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
                  <strong>Signal ID:</strong> {nextUnassigned.signal.id}
                </div>
              </div>

              {/* Instructions */}
              <div className="border-t pt-4 text-sm text-gray-600">
                Select similar signals below (including already-reviewed ones) to group them into a trend.
              </div>
            </div>
          </Card>

          <Card>
            <SimilarSignalsList
              signals={nextUnassigned.similarSignals}
              selectedIds={selectedSignalIds}
              onSelectionChange={setSelectedSignalIds}
              showAssigned={true}
            />
          </Card>
        </div>

        <ArchiveSignalModal
          signal={archivingSignal}
          isOpen={!!archivingSignal}
          onClose={() => setArchivingSignal(null)}
          onArchive={handleArchiveConfirm}
        />
      </div>
    </Layout>
  );
}
