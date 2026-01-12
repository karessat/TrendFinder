import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface ClearDataDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
  isLoading?: boolean;
}

export function ClearDataDialog({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  isLoading = false
}: ClearDataDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clear All Project Data" size="md">
      <div className="space-y-4">
        <p className="text-gray-700">
          Are you sure you want to delete all data from <strong>{projectName}</strong>?
        </p>
        
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800 font-semibold mb-2">This will permanently delete:</p>
          <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
            <li>All signals</li>
            <li>All trends</li>
            <li>All processing status</li>
          </ul>
        </div>
        
        <p className="text-sm text-gray-600">
          The project itself will remain, but all uploaded data will be removed. This action cannot be undone.
        </p>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            isLoading={isLoading}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
          >
            Clear All Data
          </Button>
        </div>
      </div>
    </Modal>
  );
}


