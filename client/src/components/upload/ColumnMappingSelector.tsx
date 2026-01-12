import { useState, useEffect } from 'react';
import { ColumnMappings, UploadPreview } from '../../types';
import { Button } from '../common/Button';

interface ColumnMappingSelectorProps {
  preview: UploadPreview;
  onConfirm: (mappings: ColumnMappings) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ColumnMappingSelector({
  preview,
  onConfirm,
  onCancel,
  isLoading = false
}: ColumnMappingSelectorProps) {
  const [mappings, setMappings] = useState<ColumnMappings>(preview.detectedMappings || {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMappings(preview.detectedMappings || {});
  }, [preview]);

  const validateMappings = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!mappings.description) {
      newErrors.description = 'Signal Description is required';
    }
    
    // Validate source URL if provided
    if (mappings.source && mappings.source !== '') {
      try {
        const url = new URL(preview.sampleRows[0]?.[mappings.source] || '');
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          newErrors.source = 'Invalid URL format';
        }
      } catch {
        // Will be validated on server side
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (validateMappings()) {
      onConfirm(mappings);
    }
  };

  const getPreviewValue = (columnName: string | undefined, rowIndex: number = 0): string => {
    if (!columnName || !preview.sampleRows[rowIndex]) return '';
    const value = preview.sampleRows[rowIndex][columnName];
    if (value === null || value === undefined) return '';
    const str = String(value);
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Column Mapping</h3>
        <p className="text-sm text-gray-600 mb-4">
          Map your spreadsheet columns to signal fields. The app has detected some mappings automatically.
        </p>
      </div>

      {/* Required: Signal Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Signal Description <span className="text-red-500">*</span>
        </label>
        <select
          value={mappings.description || ''}
          onChange={(e) => setMappings({ ...mappings, description: e.target.value || undefined })}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
            errors.description ? 'border-red-300' : 'border-gray-300'
          }`}
          disabled={isLoading}
        >
          <option value="">Select column...</option>
          {preview.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description}</p>
        )}
        {mappings.description && (
          <p className="mt-1 text-xs text-gray-500">
            Preview: {getPreviewValue(mappings.description)}
          </p>
        )}
      </div>

      {/* Optional: Signal Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Signal Title <span className="text-gray-500 text-xs">(Optional)</span>
        </label>
        <select
          value={mappings.title || ''}
          onChange={(e) => setMappings({ ...mappings, title: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={isLoading}
        >
          <option value="">Skip</option>
          {preview.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        {mappings.title && (
          <p className="mt-1 text-xs text-gray-500">
            Preview: {getPreviewValue(mappings.title)}
          </p>
        )}
      </div>

      {/* Optional: Signal Source */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Signal Source (URL) <span className="text-gray-500 text-xs">(Optional)</span>
        </label>
        <select
          value={mappings.source || ''}
          onChange={(e) => setMappings({ ...mappings, source: e.target.value || undefined })}
          className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
            errors.source ? 'border-red-300' : 'border-gray-300'
          }`}
          disabled={isLoading}
        >
          <option value="">Skip</option>
          {preview.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        {errors.source && (
          <p className="mt-1 text-sm text-red-600">{errors.source}</p>
        )}
        {mappings.source && (
          <p className="mt-1 text-xs text-gray-500">
            Preview: {getPreviewValue(mappings.source)}
          </p>
        )}
      </div>

      {/* Optional: Signal Status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Signal Status <span className="text-gray-500 text-xs">(Optional)</span>
        </label>
        <select
          value={mappings.status || ''}
          onChange={(e) => setMappings({ ...mappings, status: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={isLoading}
        >
          <option value="">Skip</option>
          {preview.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        {mappings.status && (
          <p className="mt-1 text-xs text-gray-500">
            Preview: {getPreviewValue(mappings.status)} 
            <span className="ml-2 text-yellow-600">
              (Valid values: Pending, Combined, Archived)
            </span>
          </p>
        )}
      </div>

      {/* Optional: Signal ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Signal ID <span className="text-gray-500 text-xs">(Optional)</span>
        </label>
        <select
          value={mappings.id || ''}
          onChange={(e) => setMappings({ ...mappings, id: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={isLoading}
        >
          <option value="">Skip (auto-generate)</option>
          {preview.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        {mappings.id && (
          <p className="mt-1 text-xs text-gray-500">
            Preview: {getPreviewValue(mappings.id)}
            <span className="ml-2 text-yellow-600">
              (Must be unique)
            </span>
          </p>
        )}
      </div>

      {/* Optional: Note */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Note <span className="text-gray-500 text-xs">(Optional)</span>
        </label>
        <select
          value={mappings.note || ''}
          onChange={(e) => setMappings({ ...mappings, note: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={isLoading}
        >
          <option value="">Skip</option>
          {preview.columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        {mappings.note && (
          <p className="mt-1 text-xs text-gray-500">
            Preview: {getPreviewValue(mappings.note)}
          </p>
        )}
      </div>

      {/* Sample Data Preview */}
      {preview.sampleRows.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Preview (First 3 rows)</h4>
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Row
                  </th>
                  {Object.keys(preview.sampleRows[0] || {}).slice(0, 5).map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {preview.sampleRows.slice(0, 3).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-gray-900">{idx + 1}</td>
                    {Object.keys(preview.sampleRows[0] || {}).slice(0, 5).map((col) => {
                      const value = row[col];
                      const displayValue = value === null || value === undefined 
                        ? '' 
                        : String(value).length > 30 
                          ? String(value).substring(0, 30) + '...' 
                          : String(value);
                      return (
                        <td key={col} className="px-3 py-2 text-gray-900">
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleConfirm}
          isLoading={isLoading}
          disabled={!mappings.description}
        >
          Import Signals
        </Button>
      </div>
    </div>
  );
}


