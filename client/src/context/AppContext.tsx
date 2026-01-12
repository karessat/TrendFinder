import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { ProjectListItem, ProcessingStatus } from '../types';

// State
interface AppState {
  projects: ProjectListItem[];
  currentProject: ProjectListItem | null;
  processingStatus: ProcessingStatus | null;
  isLoading: boolean;
  error: string | null;
}

// Actions
type Action =
  | { type: 'SET_PROJECTS'; payload: ProjectListItem[] }
  | { type: 'SET_CURRENT_PROJECT'; payload: ProjectListItem | null }
  | { type: 'SET_PROCESSING_STATUS'; payload: ProcessingStatus | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_PROJECT'; payload: ProjectListItem }
  | { type: 'REMOVE_PROJECT'; payload: string };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };
    case 'SET_CURRENT_PROJECT':
      return { ...state, currentProject: action.payload };
    case 'SET_PROCESSING_STATUS':
      return { ...state, processingStatus: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    case 'REMOVE_PROJECT':
      return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };
    default:
      return state;
  }
}

// Initial state
const initialState: AppState = {
  projects: [],
  currentProject: null,
  processingStatus: null,
  isLoading: false,
  error: null
};

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}


