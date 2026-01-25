import { useState, useEffect, useCallback, useRef } from 'react';
import { projectsApi } from '../services/api';
import { ProcessingStatus } from '../types';
import { useApp } from '../context/AppContext';

export function useProcessingStatus(projectId: string, enabled: boolean = true) {
  const { dispatch } = useApp();
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const loadStatus = useCallback(async (): Promise<ProcessingStatus | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await projectsApi.getProcessingStatus(projectId);
      const newStatus = response.data;
      setStatus(newStatus);
      dispatch({ type: 'SET_PROCESSING_STATUS', payload: newStatus });
      return newStatus;
    } catch (err: any) {
      // Handle rate limiting gracefully - don't show error, just skip this poll
      if (err?.response?.status === 429) {
        // Rate limited - silently skip this poll, next poll will retry
        // Don't set error state to avoid UI noise
        return null;
      }
      const message = err instanceof Error ? err.message : 'Failed to load processing status';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, dispatch]);

  // Helper function to check if processing is complete
  const isProcessingComplete = useCallback((status: ProcessingStatus): boolean => {
    if (status.status === 'complete' || status.status === 'error') {
      return true;
    }
    if (status.totalSignals > 0) {
      const allComplete = 
        status.embeddingsComplete >= status.totalSignals &&
        status.embeddingSimilaritiesComplete >= status.totalSignals &&
        status.claudeVerificationsComplete >= status.totalSignals;
      return allComplete;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled || !projectId) return;

    // Load immediately
    loadStatus().then((loadedStatus) => {
      // If processing is already complete, don't start polling
      if (loadedStatus && isProcessingComplete(loadedStatus)) {
        return;
      }

      // Then poll every 5 seconds (reduced frequency to avoid rate limiting)
      // Stop polling once processing is complete
      intervalRef.current = window.setInterval(async () => {
        try {
          const response = await projectsApi.getProcessingStatus(projectId);
          const newStatus = response.data;
          setStatus(newStatus);
          dispatch({ type: 'SET_PROCESSING_STATUS', payload: newStatus });
          
          // Check if processing is complete - if so, stop polling
          if (isProcessingComplete(newStatus) && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } catch (err: any) {
          // Handle rate limiting gracefully - don't show error, just skip this poll
          if (err?.response?.status === 429) {
            // Rate limited - silently skip this poll, next poll will retry
            // Don't set error state to avoid UI noise
            return;
          }
          // For other errors, continue polling - processing might still be ongoing
        }
      }, 5000);
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, projectId, dispatch, loadStatus, isProcessingComplete]);

  const resumeProcessing = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await projectsApi.resumeProcessing(projectId);
      await loadStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume processing';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, loadStatus]);

  const retryFailedVerifications = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await projectsApi.retryFailedVerifications(projectId);
      await loadStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retry verifications';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, loadStatus]);

  return {
    status,
    isLoading,
    error,
    loadStatus,
    resumeProcessing,
    retryFailedVerifications
  };
}

