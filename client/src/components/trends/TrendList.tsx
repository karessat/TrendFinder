import { Trend } from '../../types';
import { TrendCard } from './TrendCard';

interface TrendListProps {
  trends: Trend[];
  projectId: string;
  onEdit?: (trend: Trend) => void;
  onDelete?: (id: string) => void;
  onRetire?: (trend: Trend) => void;
  onUndo?: (id: string) => Promise<void>;
  onViewSignals?: (id: string) => Promise<void>;
}

export function TrendList({ trends, projectId, onEdit, onDelete, onRetire, onUndo, onViewSignals }: TrendListProps) {
  if (trends.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No trends found. Create your first trend by reviewing signals.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {trends.map((trend) => (
        <TrendCard
          key={trend.id}
          trend={trend}
          projectId={projectId}
          onEdit={onEdit}
          onDelete={onDelete}
          onRetire={onRetire}
          onUndo={onUndo}
          onViewSignals={onViewSignals}
        />
      ))}
    </div>
  );
}

