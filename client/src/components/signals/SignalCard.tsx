import { useState } from 'react';
import { Signal } from '../../types';

interface SignalCardProps {
  signal: Signal;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  showActions?: boolean;
  onEdit?: (signal: Signal) => void;
  onDelete?: (id: string) => void;
  onArchive?: (signal: Signal) => void;
}

export function SignalCard({
  signal,
  onSelect,
  isSelected = false,
  showActions = false,
  onEdit,
  onDelete,
  onArchive
}: SignalCardProps) {
  const [showNote, setShowNote] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Combined':
        return 'bg-green-100 text-green-800';
      case 'Archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-md p-4 border-2 transition-all ${
        isSelected ? 'border-blue-500' : 'border-transparent hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {onSelect && (
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(signal.id)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                {signal.title && (
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{signal.title}</h3>
                )}
                <p className="text-gray-900">{signal.originalText}</p>
              </div>
            </div>
          )}
          {!onSelect && (
            <>
              {signal.title && (
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{signal.title}</h3>
              )}
              <p className="text-gray-900">{signal.originalText}</p>
            </>
          )}
          
          {signal.source && (
            <div className="mt-2">
              <a 
                href={signal.source} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                View Source →
              </a>
            </div>
          )}
          
          {signal.note && (
            <div className="mt-2">
              <button
                onClick={() => setShowNote(!showNote)}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
              >
                {showNote ? 'Hide Note' : 'Show Note'}
              </button>
              {showNote && (
                <div className="mt-1 p-2 bg-gray-50 rounded text-sm text-gray-700 whitespace-pre-wrap">
                  {signal.note}
                </div>
              )}
            </div>
          )}
          
          <div className="mt-2 flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(signal.status)}`}>
              {signal.status}
            </span>
            {signal.trendId && (
              <span className="text-xs text-gray-500">
                In trend: {signal.trendId.substring(0, 8)}...
              </span>
            )}
          </div>
        </div>
        {showActions && (
          <div className="flex items-center gap-2 ml-4">
            {onEdit && signal.status !== 'Archived' && (
              <button
                onClick={() => onEdit(signal)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                title="Edit signal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {onArchive && signal.status !== 'Archived' && (
              <button
                onClick={() => onArchive(signal)}
                className="text-gray-400 hover:text-yellow-600 focus:outline-none"
                title="Archive signal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(signal.id)}
                className="text-gray-400 hover:text-red-600 focus:outline-none"
                title="Delete signal"
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

