import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTrends } from '../hooks/useTrends';
import { trendsApi } from '../services/api';
import { TrendList } from '../components/trends/TrendList';
import { TrendEditModal } from '../components/trends/TrendEditModal';
import { RetireTrendModal } from '../components/trends/RetireTrendModal';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Trend, UpdateTrendRequest } from '../types';
import { Layout } from '../components/common/Layout';

export default function TrendsView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [editingTrend, setEditingTrend] = useState<Trend | null>(null);
  const [trendDetail, setTrendDetail] = useState<any>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [trendToDelete, setTrendToDelete] = useState<string | null>(null);
  const [retiringTrend, setRetiringTrend] = useState<Trend | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const {
    trends,
    isLoading,
    error,
    total,
    loadTrends,
    updateTrend,
    deleteTrend,
    undoTrend,
    regenerateSummary
  } = useTrends(projectId || '');

  useEffect(() => {
    if (projectId) {
      loadTrends(showArchived);
    }
  }, [projectId, showArchived, loadTrends]);

  const handleEdit = (trend: Trend) => {
    setEditingTrend(trend);
  };

  const handleSave = async (id: string, data: UpdateTrendRequest) => {
    await updateTrend(id, data);
    setEditingTrend(null);
    if (projectId) {
      loadTrends(showArchived);
    }
  };

  const handleRegenerateSummary = async (id: string) => {
    await regenerateSummary(id);
    if (projectId) {
      loadTrends(showArchived);
    }
  };

  const handleDeleteClick = (id: string) => {
    setTrendToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (trendToDelete) {
      await deleteTrend(trendToDelete);
      setTrendToDelete(null);
      setIsDeleteConfirmOpen(false);
      if (projectId) {
        loadTrends(showArchived);
      }
    }
  };

  const handleRetire = (trend: Trend) => {
    setRetiringTrend(trend);
  };

  const handleRetireConfirm = async (status: 'retired' | 'archived', note: string) => {
    if (retiringTrend) {
      await updateTrend(retiringTrend.id, { status, note });
      setRetiringTrend(null);
      if (projectId) {
        loadTrends(showArchived);
      }
    }
  };

  const handleUndo = async (id: string) => {
    await undoTrend(id);
    if (projectId) {
      loadTrends(showArchived);
    }
  };

  const handleViewSignals = async (id: string) => {
    try {
      console.log('Loading trend details for:', id);
      const response = await trendsApi.get(projectId!, id);
      console.log('Trend detail response:', response.data);
      setTrendDetail(response.data);
      // Scroll to the signals card after a brief delay to ensure it's rendered
      setTimeout(() => {
        const signalsCard = document.getElementById('trend-signals-card');
        console.log('Looking for signals card element:', signalsCard);
        if (signalsCard) {
          signalsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          console.warn('Signals card element not found');
        }
      }, 200);
    } catch (err) {
      console.error('Failed to load trend details:', err);
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

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
          >
            ← Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Trends</h1>
              <p className="mt-2 text-gray-600">Total: {total} trends</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Show archived trends</span>
              </label>
              <Link to={`/projects/${projectId}/review`}>
                <Button variant="primary">
                  Review Signals
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <ErrorMessage
            message={error}
            onDismiss={() => {}}
            className="mb-6"
          />
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600">Loading trends...</p>
          </div>
        ) : trends.length === 0 ? (
          <EmptyState
            title="No trends yet"
            message="Start reviewing signals to create your first trend."
            action={{
              label: 'Review Signals',
              onClick: () => navigate(`/projects/${projectId}/review`)
            }}
          />
        ) : (
          <>
            <TrendList
              trends={trends}
              projectId={projectId}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              onRetire={handleRetire}
              onUndo={handleUndo}
              onViewSignals={handleViewSignals}
            />
            
            {trendDetail && (
              <Card 
                id="trend-signals-card"
                title={trendDetail.trend?.title || 'Trend Signals'} 
                className="mt-6"
              >
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
                  <p className="text-gray-700">{trendDetail.trend?.summary || 'No summary available'}</p>
                </div>
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Signals ({trendDetail.signals?.length || 0})
                  </h3>
                  {trendDetail.signals && trendDetail.signals.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {trendDetail.signals.map((signal: any) => (
                        <div key={signal.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                          <p className="text-sm text-gray-900">{signal.originalText || signal.original_text || 'No text available'}</p>
                          {signal.status && (
                            <span className="text-xs text-gray-500 mt-1 block">Status: {signal.status}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No signals found in this trend.</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setTrendDetail(null)}>
                    Close
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}

        <TrendEditModal
          isOpen={!!editingTrend}
          onClose={() => setEditingTrend(null)}
          trend={editingTrend}
          onSave={handleSave}
          onRegenerateSummary={handleRegenerateSummary}
        />

        <RetireTrendModal
          trend={retiringTrend}
          isOpen={!!retiringTrend}
          onClose={() => setRetiringTrend(null)}
          onRetire={handleRetireConfirm}
        />

        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsDeleteConfirmOpen(false)}></div>
              <div className="relative bg-white rounded-lg p-6 max-w-md w-full">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Trend</h3>
                <p className="text-gray-700 mb-6">
                  Are you sure you want to delete this trend? All signals will be unassigned. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteConfirmOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDeleteConfirm}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
