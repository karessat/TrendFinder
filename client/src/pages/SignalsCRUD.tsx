import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSignals } from '../hooks/useSignals';
import { SignalTable } from '../components/signals/SignalTable';
import { SignalEditModal } from '../components/signals/SignalEditModal';
import { ArchiveSignalModal } from '../components/signals/ArchiveSignalModal';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { Signal, UpdateSignalRequest } from '../types';
import { Layout } from '../components/common/Layout';

export default function SignalsCRUD() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editingSignal, setEditingSignal] = useState<Signal | null>(null);
  const [archivingSignal, setArchivingSignal] = useState<Signal | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [signalToDelete, setSignalToDelete] = useState<string | null>(null);

  const {
    signals,
    isLoading,
    error,
    total,
    unassignedCount,
    loadSignals,
    updateSignal,
    deleteSignal
  } = useSignals(projectId || '');

  useEffect(() => {
    if (projectId) {
      loadSignals({ status: statusFilter || undefined, limit: 100, offset: 0 });
    }
  }, [projectId, statusFilter, loadSignals]);

  const handleEdit = (signal: Signal) => {
    setEditingSignal(signal);
  };

  const handleSave = async (id: string, data: UpdateSignalRequest) => {
    await updateSignal(id, data);
    setEditingSignal(null);
    if (projectId) {
      loadSignals({ status: statusFilter || undefined, limit: 100, offset: 0 });
    }
  };

  const handleDeleteClick = (id: string) => {
    setSignalToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (signalToDelete) {
      await deleteSignal(signalToDelete);
      setSignalToDelete(null);
      setIsDeleteConfirmOpen(false);
      if (projectId) {
        loadSignals({ status: statusFilter || undefined, limit: 100, offset: 0 });
      }
    }
  };

  const handleArchive = (signal: Signal) => {
    setArchivingSignal(signal);
  };

  const handleArchiveConfirm = async (note: string) => {
    if (archivingSignal) {
      await updateSignal(archivingSignal.id, { status: 'Archived', note });
      setArchivingSignal(null);
      if (projectId) {
        loadSignals({ status: statusFilter || undefined, limit: 100, offset: 0 });
      }
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
              <h1 className="text-3xl font-bold text-gray-900">Manage Signals</h1>
              <p className="mt-2 text-gray-600">
                Total: {total} | Unassigned: {unassignedCount}
              </p>
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

        <Card>
          <div className="mb-4 flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Filter by status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <Spinner size="lg" className="mx-auto mb-4" />
              <p className="text-gray-600">Loading signals...</p>
            </div>
          ) : (
            <SignalTable
              signals={signals}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              onArchive={handleArchive}
              projectId={projectId}
            />
          )}
        </Card>

        <SignalEditModal
          isOpen={!!editingSignal}
          onClose={() => setEditingSignal(null)}
          signal={editingSignal}
          onSave={handleSave}
        />

        <ArchiveSignalModal
          signal={archivingSignal}
          isOpen={!!archivingSignal}
          onClose={() => setArchivingSignal(null)}
          onArchive={handleArchiveConfirm}
        />

        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsDeleteConfirmOpen(false)}></div>
              <div className="relative bg-white rounded-lg p-6 max-w-md w-full">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Signal</h3>
                <p className="text-gray-700 mb-6">
                  Are you sure you want to delete this signal? This action cannot be undone.
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
