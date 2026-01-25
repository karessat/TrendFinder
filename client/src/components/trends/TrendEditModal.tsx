import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Trend, UpdateTrendRequest } from '../../types';

interface TrendEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  trend: Trend | null;
  onSave: (id: string, data: UpdateTrendRequest) => Promise<void>;
  onRegenerateSummary?: (id: string) => Promise<void>;
}

export function TrendEditModal({
  isOpen,
  onClose,
  trend,
  onSave,
  onRegenerateSummary
}: TrendEditModalProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<Trend['status']>('draft');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (trend) {
      setTitle(trend.title || '');
      setSummary(trend.summary || '');
      setStatus(trend.status);
    } else {
      // Reset when trend is null
      setTitle('');
      setSummary('');
      setStatus('draft');
    }
  }, [trend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trend) return;

    setIsLoading(true);
    setError(null);
    try {
      if (!title || title.trim().length === 0) {
        setError('Title is required');
        return;
      }
      
      const updates: UpdateTrendRequest = {};
      if (title.trim() !== trend.title) {
        updates.title = title.trim();
      }
      if (summary !== trend.summary) {
        updates.summary = summary;
      }
      if (status !== trend.status) {
        updates.status = status;
      }
      await onSave(trend.id, updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trend');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateSummary = async () => {
    if (!trend || !onRegenerateSummary) return;

    setIsRegenerating(true);
    setError(null);
    try {
      await onRegenerateSummary(trend.id);
      // Summary will be updated via the trend prop
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate summary');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleClose = () => {
    if (!isLoading && !isRegenerating && trend) {
      setTitle(trend.title || '');
      setSummary(trend.summary || '');
      setStatus(trend.status);
      setError(null);
      onClose();
    }
  };

  if (!trend) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Trend" size="lg">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="trend-title" className="block text-sm font-medium text-gray-700 mb-2">
            Title
          </label>
          <input
            id="trend-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading || isRegenerating}
            placeholder="Enter a title for this trend (1-3 words)"
            maxLength={200}
            required
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="trend-summary" className="block text-sm font-medium text-gray-700">
              Summary
            </label>
            {onRegenerateSummary && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRegenerateSummary}
                isLoading={isRegenerating}
                className="text-xs"
              >
                Regenerate with Claude
              </Button>
            )}
          </div>
          <textarea
            id="trend-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading || isRegenerating}
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="trend-status" className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            id="trend-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Trend['status'])}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading || isRegenerating}
          >
            <option value="draft">Draft</option>
            <option value="final">Final</option>
          </select>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading || isRegenerating}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            disabled={isRegenerating}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}


