import { useState, useEffect } from 'react';

interface ColumnSelectorProps {
  columns: string[];
  selectedColumn: string | null;
  onSelect: (column: string) => void;
  detectedColumn?: string;
}

export function ColumnSelector({ columns, selectedColumn, onSelect, detectedColumn }: ColumnSelectorProps) {
  const [localSelected, setLocalSelected] = useState(selectedColumn || detectedColumn || '');

  useEffect(() => {
    if (detectedColumn && !selectedColumn) {
      setLocalSelected(detectedColumn);
      onSelect(detectedColumn);
    }
  }, [detectedColumn, selectedColumn, onSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setLocalSelected(value);
    onSelect(value);
  };

  if (columns.length === 0) {
    return (
      <div className="text-sm text-gray-600">
        No columns detected. Please check your file format.
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="column-select" className="block text-sm font-medium text-gray-700 mb-2">
        Select Text Column
        {detectedColumn && (
          <span className="ml-2 text-xs text-gray-500">
            (Auto-detected: {detectedColumn})
          </span>
        )}
      </label>
      <select
        id="column-select"
        value={localSelected}
        onChange={handleChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">Select a column...</option>
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>
    </div>
  );
}


