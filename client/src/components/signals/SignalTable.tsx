import { Signal } from '../../types';
import { SignalCard } from './SignalCard';

interface SignalTableProps {
  signals: Signal[];
  onEdit?: (signal: Signal) => void;
  onDelete?: (id: string) => void;
  onArchive?: (signal: Signal) => void;
  onSelect?: (id: string) => void;
  selectedIds?: string[];
  projectId?: string;
}

export function SignalTable({
  signals,
  onEdit,
  onDelete,
  onArchive,
  onSelect,
  selectedIds = [],
  projectId
}: SignalTableProps) {
  if (signals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No signals found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {signals.map((signal) => (
        <SignalCard
          key={signal.id}
          signal={signal}
          isSelected={selectedIds.includes(signal.id)}
          onSelect={onSelect}
          showActions={!!(onEdit || onDelete || onArchive)}
          onEdit={onEdit}
          onDelete={onDelete}
          onArchive={onArchive}
          projectId={projectId}
        />
      ))}
    </div>
  );
}

