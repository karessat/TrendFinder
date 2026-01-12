import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ProjectDashboard from './pages/ProjectDashboard';
import Upload from './pages/Upload';
import SignalReview from './pages/SignalReview';
import SignalsCRUD from './pages/SignalsCRUD';
import TrendsView from './pages/TrendsView';
import Export from './pages/Export';
import { authApi } from './services/api';
import { Spinner } from './components/common/Spinner';
import axios from 'axios';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      // Check authentication via API call (cookies are sent automatically)
      try {
        await authApi.getMe();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  // Fetch CSRF token on app initialization
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        await axios.get('/api/csrf-token', {
          withCredentials: true
        });
        // Token is set in cookie by backend, no need to store it
      } catch (error) {
        // Silently fail - CSRF token will be set on first API call
        console.debug('Failed to fetch CSRF token:', error);
      }
    };

    fetchCsrfToken();
  }, []);

  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ProjectDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <ProjectDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/upload"
              element={
                <ProtectedRoute>
                  <Upload />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/review"
              element={
                <ProtectedRoute>
                  <SignalReview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/signals"
              element={
                <ProtectedRoute>
                  <SignalsCRUD />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/trends"
              element={
                <ProtectedRoute>
                  <TrendsView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/export"
              element={
                <ProtectedRoute>
                  <Export />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;

