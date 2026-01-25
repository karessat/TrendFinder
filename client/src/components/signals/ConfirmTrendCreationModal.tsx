import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { Signal, SimilarSignal } from '../../types';

interface ConfirmTrendCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSignal: Signal;
  selectedSimilarSignals: SimilarSignal[];
  onConfirm: () => Promise<void>;
  isCreating: boolean;
}

export function ConfirmTrendCreationModal({
  isOpen,
  onClose,
  currentSignal,
  selectedSimilarSignals,
  onConfirm,
  isCreating
}: ConfirmTrendCreationModalProps) {
  const totalSignals = 1 + selectedSimilarSignals.length;
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trend');
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setError(null);
      onClose();
    }
  };

  // Claude scores are on a 1-10 scale, convert to percentage (10 = 100%)
  const scoreToPercent = (score: number): number => {
    return score > 1 ? (score / 10) * 100 : score * 100;
  };

  const getScoreColor = (score: number) => {
    const percent = scoreToPercent(score);
    if (percent >= 80) return 'bg-green-100 text-green-800';
    if (percent >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Confirm Trend Creation" size="lg">
      <div className="space-y-4">
        <div className="mb-4">
          <p className="text-sm text-gray-700">
            Review the signals that will be included in this trend. Click "Create Trend" to proceed.
          </p>
          <p className="text-sm font-medium text-gray-900 mt-2">
            Total signals: {totalSignals}
          </p>
        </div>

        {/* Current Signal Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            Current Signal (always included)
          </h4>
          <div className="p-3 rounded-lg border-2 border-blue-500 bg-blue-50">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                {currentSignal.status}
              </span>
            </div>
            {currentSignal.title && (
              <h5 className="text-sm font-semibold text-gray-900 mb-1">{currentSignal.title}</h5>
            )}
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
              {currentSignal.originalText.length > 200 
                ? `${currentSignal.originalText.substring(0, 200)}...` 
                : currentSignal.originalText}
            </p>
            {currentSignal.source && (
              <a 
                href={currentSignal.source} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 block"
              >
                View Source →
              </a>
            )}
          </div>
        </div>

        {/* Selected Similar Signals Section */}
        {selectedSimilarSignals.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">
              Selected Similar Signals ({selectedSimilarSignals.length})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedSimilarSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="p-3 rounded-lg border-2 border-gray-200 bg-gray-50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(signal.score)}`}>
                      {scoreToPercent(signal.score).toFixed(0)}% match
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      signal.status === 'Combined' 
                        ? 'bg-green-100 text-green-800' 
                        : signal.status === 'Archived'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {signal.status}
                    </span>
                  </div>
                  {signal.title && (
                    <h5 className="text-sm font-semibold text-gray-900 mb-1">{signal.title}</h5>
                  )}
                  <p className="text-sm text-gray-900">
                    {signal.originalText.length > 200 
                      ? `${signal.originalText.substring(0, 200)}...` 
                      : signal.originalText}
                  </p>
                  {signal.source && (
                    <a 
                      href={signal.source} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 block"
                    >
                      View Source →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <ErrorMessage message={error} onDismiss={() => setError(null)} className="mt-4" />
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            isLoading={isCreating}
            disabled={isCreating}
          >
            Create Trend
          </Button>
        </div>
      </div>
    </Modal>
  );
}

