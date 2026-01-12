import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Signal, UpdateSignalRequest, SignalStatusDisplay } from '../../types';

interface SignalEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  signal: Signal | null;
  onSave: (id: string, data: UpdateSignalRequest) => Promise<void>;
}

export function SignalEditModal({ isOpen, onClose, signal, onSave }: SignalEditModalProps) {
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [status, setStatus] = useState<SignalStatusDisplay>('Pending');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signal) {
      setDescription(signal.originalText);
      setTitle(signal.title || '');
      setSource(signal.source || '');
      setNote(signal.note || '');
      setStatus(signal.status);
    }
  }, [signal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signal) return;

    // Validate: require note when archiving
    if (status === 'Archived' && (!note || !note.trim())) {
      setError('Note is required when archiving a signal. Please provide a reason for archiving.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const updates: UpdateSignalRequest = {};
      if (description !== signal.originalText) {
        updates.description = description;
      }
      if (title !== (signal.title || '')) {
        updates.title = title || null;
      }
      if (source !== (signal.source || '')) {
        updates.source = source || null;
      }
      if (note !== (signal.note || '')) {
        updates.note = note || null;
      }
      if (status !== signal.status) {
        updates.status = status;
      }
      await onSave(signal.id, updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update signal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading && signal) {
      setDescription(signal.originalText);
      setTitle(signal.title || '');
      setSource(signal.source || '');
      setNote(signal.note || '');
      setStatus(signal.status);
      setError(null);
      onClose();
    }
  };

  if (!signal) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Signal" size="lg">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="signal-title" className="block text-sm font-medium text-gray-700 mb-2">
            Signal Title (Optional)
          </label>
          <input
            id="signal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
            placeholder="Enter signal title"
            maxLength={500}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="signal-description" className="block text-sm font-medium text-gray-700 mb-2">
            Signal Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="signal-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
            required
            placeholder="Enter signal description"
            maxLength={10000}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="signal-source" className="block text-sm font-medium text-gray-700 mb-2">
            Signal Source (URL) (Optional)
          </label>
          <input
            id="signal-source"
            type="url"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
            placeholder="https://example.com/source"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="signal-status" className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            id="signal-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SignalStatusDisplay)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          >
            <option value="Pending">Pending</option>
            <option value="Combined">Combined</option>
            <option value="Archived">Archived</option>
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="signal-note" className="block text-sm font-medium text-gray-700 mb-2">
            Note {status === 'Archived' && <span className="text-red-500">*</span>}
            <span className="text-xs text-gray-500 ml-2">(Required when archiving)</span>
          </label>
          <textarea
            id="signal-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
            required={status === 'Archived'}
            placeholder={status === 'Archived' ? 'Explain why this signal is being archived...' : 'Enter notes about this signal (optional)'}
            maxLength={5000}
          />
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
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

