import { Link } from 'react-router-dom';
import { Trend } from '../../types';

interface TrendCardProps {
  trend: Trend;
  projectId: string;
  onEdit?: (trend: Trend) => void;
  onDelete?: (id: string) => void;
  onRetire?: (trend: Trend) => void;
}

/**
 * Get trend title, falling back to extracted title if not available
 */
function getTrendTitle(trend: { title: string | null; summary: string }): string {
  // Use generated title if available
  if (trend.title && trend.title.trim()) {
    return trend.title;
  }
  
  // Fallback: extract from summary (for old trends without titles)
  const cleaned = trend.summary
    .replace(/^(The|This|These|A|An)\s+/i, '')
    .replace(/[.,;:!?]+$/, '')
    .trim();
  
  const words = cleaned.split(/\s+/);
  const wordCount = words.length >= 4 ? 4 : words.length >= 3 ? 3 : words.length >= 2 ? 2 : words.length;
  const title = words.slice(0, wordCount).join(' ');
  
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function TrendCard({ trend, projectId, onEdit, onDelete, onRetire }: TrendCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'final':
        return 'bg-green-100 text-green-800';
      case 'retired':
        return 'bg-yellow-100 text-yellow-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Link
            to={`/projects/${projectId}/trends/${trend.id}`}
            className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors block mb-2"
          >
            {getTrendTitle(trend)}
          </Link>
          <p className="text-gray-700 mb-3 line-clamp-3">{trend.summary}</p>
          {trend.note && (
            <div className="mb-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
              <strong>Note:</strong> {trend.note}
            </div>
          )}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>{trend.signalCount} signals</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(trend.status)}`}>
              {trend.status}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(trend.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        {(onEdit || onDelete || onRetire) && (
          <div className="flex items-center gap-2 ml-4">
            {onEdit && trend.status !== 'retired' && trend.status !== 'archived' && (
              <button
                onClick={() => onEdit(trend)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                title="Edit trend"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {onRetire && trend.status !== 'retired' && trend.status !== 'archived' && (
              <button
                onClick={() => onRetire(trend)}
                className="text-gray-400 hover:text-yellow-600 focus:outline-none"
                title="Retire or archive trend"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(trend.id)}
                className="text-gray-400 hover:text-red-600 focus:outline-none"
                title="Delete trend"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

