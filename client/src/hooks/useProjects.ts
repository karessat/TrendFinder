import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { projectsApi } from '../services/api';
import { ProjectListItem, CreateProjectRequest } from '../types';

export function useProjects() {
  const { state, dispatch } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await projectsApi.list();
      dispatch({ type: 'SET_PROJECTS', payload: response.data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  const createProject = useCallback(async (data: CreateProjectRequest): Promise<ProjectListItem | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await projectsApi.create(data);
      const newProject: ProjectListItem = {
        id: response.data.id,
        name: response.data.name,
        signalCount: 0,
        trendCount: 0,
        processingStatus: 'pending',
        createdAt: response.data.createdAt
      };
      dispatch({ type: 'ADD_PROJECT', payload: newProject });
      return newProject;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await projectsApi.delete(id);
      dispatch({ type: 'REMOVE_PROJECT', payload: id });
      if (state.currentProject?.id === id) {
        dispatch({ type: 'SET_CURRENT_PROJECT', payload: null });
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, state.currentProject]);

  const clearProjectData = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await projectsApi.clearData(id);
      // Reload projects to refresh counts
      await loadProjects();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear project data';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, loadProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects: state.projects,
    isLoading,
    error,
    loadProjects,
    createProject,
    deleteProject,
    clearProjectData
  };
}

