import { useState, useCallback } from 'react';
import { trendsApi } from '../services/api';
import { Trend, CreateTrendRequest, UpdateTrendRequest } from '../types';

export function useTrends(projectId: string) {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const loadTrends = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await trendsApi.list(projectId);
      setTrends(response.data.trends);
      setTotal(response.data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load trends';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createTrend = useCallback(async (data: CreateTrendRequest): Promise<Trend | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await trendsApi.create(projectId, data);
      const newTrend = response.data.trend;
      setTrends(prev => [...prev, newTrend]);
      setTotal(prev => prev + 1);
      return newTrend;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create trend';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const updateTrend = useCallback(async (trendId: string, data: UpdateTrendRequest): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await trendsApi.update(projectId, trendId, data);
      setTrends(prev => prev.map(t => t.id === trendId ? { ...t, ...response.data.trend } : t));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update trend';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const deleteTrend = useCallback(async (trendId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await trendsApi.delete(projectId, trendId);
      setTrends(prev => prev.filter(t => t.id !== trendId));
      setTotal(prev => prev - 1);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete trend';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const regenerateSummary = useCallback(async (trendId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await trendsApi.regenerateSummary(projectId, trendId);
      setTrends(prev => prev.map(t => t.id === trendId ? { 
        ...t, 
        title: response.data.trend.title || null,
        summary: response.data.trend.summary 
      } : t));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate summary';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  return {
    trends,
    isLoading,
    error,
    total,
    loadTrends,
    createTrend,
    updateTrend,
    deleteTrend,
    regenerateSummary
  };
}

