import { useState, useCallback } from 'react';
import { exportApi } from '../services/api';

export function useExport(projectId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadFile = useCallback((blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, []);

  const exportTrendsCsv = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await exportApi.trendsCsv(projectId);
      downloadFile(response.data, `trends-with-signals-${projectId}.csv`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export trends';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, downloadFile]);

  const exportSignalsCsv = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await exportApi.signalsCsv(projectId);
      downloadFile(response.data, `signals-${projectId}.csv`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export signals';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, downloadFile]);

  const exportSummaryCsv = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await exportApi.summaryCsv(projectId);
      downloadFile(response.data, `trend-summaries-${projectId}.csv`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export summaries';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, downloadFile]);

  return {
    isLoading,
    error,
    exportTrendsCsv,
    exportSignalsCsv,
    exportSummaryCsv
  };
}


