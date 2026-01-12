import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { Trend } from '../../types';

interface RetireTrendModalProps {
  trend: Trend | null;
  isOpen: boolean;
  onClose: () => void;
  onRetire: (status: 'retired' | 'archived', note: string) => Promise<void>;
}

export function RetireTrendModal({
  trend,
  isOpen,
  onClose,
  onRetire
}: RetireTrendModalProps) {
  const [status, setStatus] = useState<'retired' | 'archived'>('retired');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trend) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!note.trim()) {
      setError('Please provide a note explaining why this trend is being retired/archived');
      return;
    }

    setIsLoading(true);
    try {
      await onRetire(status, note.trim());
      setNote('');
      setStatus('retired');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retire trend');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setNote('');
      setStatus('retired');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Retire or Archive Trend">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'retired' | 'archived')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          >
            <option value="retired">Retired</option>
            <option value="archived">Archived</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {status === 'retired' 
              ? 'Retired: Trend is no longer active but may be referenced later'
              : 'Archived: Trend is stored for historical reference only'}
          </p>
        </div>

        <div className="mb-4">
          <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
            Note <span className="text-red-500">*</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Explain why this trend is being retired or archived..."
            required
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Required: Please provide a brief explanation for retiring/archiving this trend.
          </p>
        </div>

        {error && (
          <ErrorMessage message={error} onDismiss={() => setError(null)} className="mb-4" />
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            disabled={!note.trim()}
          >
            {status === 'retired' ? 'Retire Trend' : 'Archive Trend'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


