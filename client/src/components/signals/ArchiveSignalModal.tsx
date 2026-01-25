import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { Signal } from '../../types';

interface ArchiveSignalModalProps {
  signal: Signal | null;
  isOpen: boolean;
  onClose: () => void;
  onArchive: (note: string) => Promise<void>;
}

export function ArchiveSignalModal({
  signal,
  isOpen,
  onClose,
  onArchive
}: ArchiveSignalModalProps) {
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!note.trim()) {
      setError('Please provide a note explaining why this signal is being archived');
      return;
    }

    setIsLoading(true);
    try {
      await onArchive(note.trim());
      setNote('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive signal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setNote('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Archive Scan Hit">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <p className="text-sm text-gray-700 mb-4">
            Archiving this scan hit will mark it as no longer active. Please provide a reason for archiving.
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
            placeholder="Explain why this scan hit is being archived..."
            required
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Required: Please provide a brief explanation for archiving this scan hit.
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
            Archive Scan Hit
          </Button>
        </div>
      </form>
    </Modal>
  );
}


