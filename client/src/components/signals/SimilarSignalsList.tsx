import { useState } from 'react';
import { SimilarSignal } from '../../types';

interface SimilarSignalsListProps {
  signals: SimilarSignal[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  showAssigned?: boolean;
}

export function SimilarSignalsList({
  signals,
  selectedIds,
  onSelectionChange,
  showAssigned = true // Default to showing all signals including assigned ones
}: SimilarSignalsListProps) {
  const [showAssignedSignals, setShowAssignedSignals] = useState(showAssigned);

  const filteredSignals = showAssignedSignals
    ? signals
    : signals.filter(s => s.status === 'Pending');

  // Sort by score in descending order (highest similarity first)
  const sortedSignals = [...filteredSignals].sort((a, b) => b.score - a.score);

  // Claude scores are on a 1-10 scale, convert to percentage (10 = 100%)
  const scoreToPercent = (score: number): number => {
    // If score is > 1, it's a Claude score (1-10), convert to percentage
    // If score is <= 1, it's a cosine similarity (0-1), convert to percentage
    return score > 1 ? (score / 10) * 100 : score * 100;
  };

  const getScoreColor = (score: number) => {
    const percent = scoreToPercent(score);
    if (percent >= 80) return 'bg-green-100 text-green-800';
    if (percent >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const handleToggle = (signalId: string) => {
    if (selectedIds.includes(signalId)) {
      onSelectionChange(selectedIds.filter(id => id !== signalId));
    } else {
      onSelectionChange([...selectedIds, signalId]);
    }
  };

  if (signals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No similar signals found
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Similar Signals ({filteredSignals.length})
        </h3>
        <label className="flex items-center text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showAssignedSignals}
            onChange={(e) => setShowAssignedSignals(e.target.checked)}
            className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          Hide reviewed signals
        </label>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {sortedSignals.map((signal) => (
          <div
            key={signal.id}
            className={`p-3 rounded-lg border-2 transition-all ${
              selectedIds.includes(signal.id)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.includes(signal.id)}
                onChange={() => handleToggle(signal.id)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getScoreColor(signal.score)}`}>
                    {scoreToPercent(signal.score).toFixed(0)}% match
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    signal.status === 'Combined' 
                      ? 'bg-green-100 text-green-800' 
                      : signal.status === 'Archived'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {signal.status}
                  </span>
                  {signal.trendSummary && (
                    <span className="text-xs text-gray-500">
                      Trend: {signal.trendSummary.substring(0, 50)}...
                    </span>
                  )}
                </div>
                {signal.title && (
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">{signal.title}</h4>
                )}
                <p className="text-sm text-gray-900">{signal.originalText}</p>
                {signal.source && (
                  <a 
                    href={signal.source} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 block"
                  >
                    View Source →
                  </a>
                )}
                {signal.note && (
                  <p className="text-xs text-gray-600 mt-1 italic">{signal.note.substring(0, 100)}{signal.note.length > 100 ? '...' : ''}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

