import { useState, useCallback } from 'react';
import { signalsApi } from '../services/api';
import { Signal, NextUnassignedResponse, CreateSignalRequest, UpdateSignalRequest } from '../types';

export function useSignals(projectId: string) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [nextUnassigned, setNextUnassigned] = useState<NextUnassignedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);

  const loadSignals = useCallback(async (params?: { status?: string; limit?: number; offset?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await signalsApi.list(projectId, params);
      setSignals(response.data.signals);
      setTotal(response.data.total);
      setUnassignedCount(response.data.unassignedCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load signals';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const loadNextUnassigned = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      console.log('Loading next unassigned for project:', projectId, 'Length:', projectId.length);
      const response = await signalsApi.getNextUnassigned(projectId);
      setNextUnassigned(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load next unassigned signal';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createSignal = useCallback(async (data: CreateSignalRequest): Promise<Signal | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await signalsApi.create(projectId, data);
      const newSignal = response.data;
      setSignals(prev => [...prev, newSignal]);
      setTotal(prev => prev + 1);
      setUnassignedCount(prev => prev + 1);
      return newSignal;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create signal';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const updateSignal = useCallback(async (signalId: string, data: UpdateSignalRequest): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await signalsApi.update(projectId, signalId, data);
      const updatedSignal = response.data;
      setSignals(prev => prev.map(s => s.id === signalId ? updatedSignal : s));
      // Update nextUnassigned if it's the same signal
      if (nextUnassigned?.signal?.id === signalId) {
        setNextUnassigned(prev => prev ? {
          ...prev,
          signal: updatedSignal
        } : null);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update signal';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, nextUnassigned]);

  const deleteSignal = useCallback(async (signalId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await signalsApi.delete(projectId, signalId);
      setSignals(prev => prev.filter(s => s.id !== signalId));
      setTotal(prev => prev - 1);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete signal';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  return {
    signals,
    nextUnassigned,
    isLoading,
    error,
    total,
    unassignedCount,
    loadSignals,
    loadNextUnassigned,
    createSignal,
    updateSignal,
    deleteSignal
  };
}

