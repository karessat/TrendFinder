import axios, { AxiosError } from 'axios';
import {
  ProjectListItem,
  ProjectResponse,
  CreateProjectRequest,
  UploadResponse,
  UploadPreview,
  ColumnMappings,
  ProcessingStatusResponse,
  SignalListResponse,
  NextUnassignedResponse,
  SignalDetailResponse,
  CreateSignalRequest,
  UpdateSignalRequest,
  TrendListResponse,
  TrendDetailResponse,
  TrendResponse,
  CreateTrendRequest,
  UpdateTrendRequest,
  ErrorResponse
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // Include cookies for JWT authentication and CSRF tokens
});

// Get CSRF token from cookie and add to request headers
api.interceptors.request.use((config) => {
  // Get CSRF token from cookie (set by backend)
  const csrfToken = getCookie('csrf-token');
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

// Helper function to get cookie value
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

// Error handler
api.interceptors.response.use(
  response => response,
  (error: AxiosError<ErrorResponse>) => {
    const message = error.response?.data?.error || error.message || 'Unknown error';
    
    // Handle 401 errors (unauthorized) - redirect to login
    if (error.response?.status === 401) {
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name?: string }) =>
    api.post<{ user: { id: string; email: string; name: string | null; role: string }; token: string }>('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post<{ user: { id: string; email: string; name: string | null; role: string }; token: string }>('/auth/login', data),
  
  logout: () => api.post('/auth/logout'),
  
  getMe: () => api.get<{ user: { id: string; email: string; role: string } }>('/auth/me'),
  
  forgotPassword: (data: { email: string; resetUrl?: string }) =>
    api.post<{ message: string }>('/auth/forgot-password', data),
  
  resetPassword: (data: { token: string; password: string }) =>
    api.post<{ message: string }>('/auth/reset-password', data)
};

// Projects
export const projectsApi = {
  list: () => api.get<ProjectListItem[]>('/projects'),
  create: (data: CreateProjectRequest) => api.post<ProjectResponse>('/projects', data),
  delete: (id: string) => api.delete(`/projects/${encodeURIComponent(id)}`),
  clearData: (id: string) => api.delete(`/projects/${encodeURIComponent(id)}/data`),
  
  uploadPreview: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<UploadPreview>(`/projects/${encodeURIComponent(projectId)}/upload/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  upload: (projectId: string, file: File, mappings?: ColumnMappings) => {
    const formData = new FormData();
    formData.append('file', file);
    if (mappings) {
      formData.append('mappings', JSON.stringify(mappings));
    }
    return api.post<UploadResponse>(`/projects/${encodeURIComponent(projectId)}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  uploadLegacy: (projectId: string, file: File, textColumn?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const params = textColumn ? `?textColumn=${encodeURIComponent(textColumn)}` : '';
    return api.post<UploadResponse>(`/projects/${encodeURIComponent(projectId)}/upload${params}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  getProcessingStatus: (projectId: string) => 
    api.get<ProcessingStatusResponse>(`/projects/${encodeURIComponent(projectId)}/processing-status`),
  
  resumeProcessing: (projectId: string) =>
    api.post(`/projects/${encodeURIComponent(projectId)}/resume-processing`),
  
  retryFailedVerifications: (projectId: string) =>
    api.post(`/projects/${encodeURIComponent(projectId)}/retry-verifications`)
};

// Signals
export const signalsApi = {
  list: (projectId: string, params?: { status?: string; limit?: number; offset?: number }) =>
    api.get<SignalListResponse>(`/projects/${encodeURIComponent(projectId)}/signals`, { params }),
  
  getNextUnassigned: (projectId: string, excludeSignalId?: string) => {
    const encoded = encodeURIComponent(projectId);
    const params = excludeSignalId ? { excludeSignalId } : undefined;
    console.log('API call - Original projectId:', projectId, 'Encoded:', encoded, 'Length:', projectId.length, 'ExcludeSignalId:', excludeSignalId);
    const url = `/projects/${encoded}/signals/next-unassigned`;
    console.log('Full URL will be:', url, 'with params:', params);
    return api.get<NextUnassignedResponse>(url, { params });
  },
  
  get: (projectId: string, signalId: string) =>
    api.get<SignalDetailResponse>(`/projects/${encodeURIComponent(projectId)}/signals/${encodeURIComponent(signalId)}`),
  
  create: (projectId: string, data: CreateSignalRequest) =>
    api.post<SignalDetailResponse>(`/projects/${encodeURIComponent(projectId)}/signals`, data),
  
  update: (projectId: string, signalId: string, data: UpdateSignalRequest) =>
    api.put<SignalDetailResponse>(`/projects/${encodeURIComponent(projectId)}/signals/${encodeURIComponent(signalId)}`, data),
  
  delete: (projectId: string, signalId: string) =>
    api.delete(`/projects/${encodeURIComponent(projectId)}/signals/${encodeURIComponent(signalId)}`)
};

// Trends
export const trendsApi = {
  list: (projectId: string, includeArchived: boolean = false) =>
    api.get<TrendListResponse>(`/projects/${encodeURIComponent(projectId)}/trends${includeArchived ? '?includeArchived=true' : ''}`),
  
  get: (projectId: string, trendId: string) =>
    api.get<TrendDetailResponse>(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}`),
  
  create: (projectId: string, data: CreateTrendRequest) =>
    api.post<TrendResponse>(`/projects/${encodeURIComponent(projectId)}/trends`, data),
  
  update: (projectId: string, trendId: string, data: UpdateTrendRequest) =>
    api.put(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}`, data),
  
  delete: (projectId: string, trendId: string) =>
    api.delete(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}`),
  
  undo: (projectId: string, trendId: string) =>
    api.post<TrendResponse>(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}/undo`),
  
  regenerateSummary: (projectId: string, trendId: string) =>
    api.post<TrendResponse>(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}/regenerate-summary`),
  
  addSignals: (projectId: string, trendId: string, signalIds: string[], regenerate = false) =>
    api.post<TrendResponse>(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}/add-signals`, {
      signalIds,
      regenerateSummary: regenerate
    }),
  
  removeSignals: (projectId: string, trendId: string, signalIds: string[], regenerate = false) =>
    api.post(`/projects/${encodeURIComponent(projectId)}/trends/${encodeURIComponent(trendId)}/remove-signals`, {
      signalIds,
      regenerateSummary: regenerate
    })
};

// Export
export const exportApi = {
  trendsCsv: (projectId: string) =>
    api.get(`/projects/${encodeURIComponent(projectId)}/export/trends-csv`, { responseType: 'blob' }),
  
  signalsCsv: (projectId: string) =>
    api.get(`/projects/${encodeURIComponent(projectId)}/export/signals-csv`, { responseType: 'blob' }),
  
  summaryCsv: (projectId: string) =>
    api.get(`/projects/${encodeURIComponent(projectId)}/export/summary-csv`, { responseType: 'blob' })
};

