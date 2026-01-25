import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useProcessingStatus } from '../hooks/useProcessingStatus';
import { useSignals } from '../hooks/useSignals';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ProgressBar } from '../components/common/ProgressBar';
import { Spinner } from '../components/common/Spinner';
import { ClearDataDialog } from '../components/projects/ClearDataDialog';
import { Modal } from '../components/common/Modal';
import { Layout } from '../components/common/Layout';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import { EmptyState } from '../components/common/EmptyState';

export default function ProjectDashboard() {
  const { projectId: urlProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { projects, clearProjectData, isLoading: isProjectsLoading, createProject, isLoading: isProjectsLoadingState } = useProjects();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Determine which project to show: use URL param if present, otherwise use first project
  const effectiveProjectId = urlProjectId || (projects.length > 0 ? projects[0].id : null);
  const { status, loadStatus: reloadStatus } = useProcessingStatus(effectiveProjectId || '', !!effectiveProjectId);
  const { unassignedCount, loadSignals } = useSignals(effectiveProjectId || '');
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isProcessingAlertOpen, setIsProcessingAlertOpen] = useState(false);
  const [isProcessingProgressExpanded, setIsProcessingProgressExpanded] = useState(false);

  const project = effectiveProjectId ? projects.find(p => p.id === effectiveProjectId) : null;
  
  // Load signals to get unassigned count when processing is complete
  useEffect(() => {
    if (effectiveProjectId) {
      // Check if processing is complete
      const allPhasesComplete = status && status.totalSignals > 0 && 
        status.embeddingsComplete >= status.totalSignals &&
        status.embeddingSimilaritiesComplete >= status.totalSignals &&
        status.claudeVerificationsComplete >= status.totalSignals;
      
      const isComplete = !status || status.status === 'complete' || status.status === 'error' || allPhasesComplete;
      
      if (isComplete) {
        loadSignals();
      }
    }
  }, [effectiveProjectId, status, loadSignals]);
  
  // If no projectId in URL and we have projects, redirect to first project's dashboard
  useEffect(() => {
    if (!urlProjectId && projects.length > 0 && effectiveProjectId) {
      navigate(`/projects/${effectiveProjectId}`, { replace: true });
    }
  }, [urlProjectId, projects, effectiveProjectId, navigate]);

  // Check if processing is complete (or in error state where review is still possible)
  const isProcessingComplete = () => {
    if (!status) {
      // If no status, assume not started or pending - allow access
      return true;
    }
    
    // Check explicit status first
    if (status.status === 'complete' || status.status === 'error') {
      return true;
    }
    
    // Also check if all phases are actually complete (handles cases where status wasn't updated)
    // This fixes the bug where status might be 'claude_verification' but all work is done
    if (status.totalSignals > 0) {
      const allEmbeddingsDone = status.embeddingsComplete >= status.totalSignals;
      const allSimilaritiesDone = status.embeddingSimilaritiesComplete >= status.totalSignals;
      const allVerificationsDone = status.claudeVerificationsComplete >= status.totalSignals;
      
      // If all phases are complete, allow access even if status field says otherwise
      if (allEmbeddingsDone && allSimilaritiesDone && allVerificationsDone) {
        return true;
      }
    }
    
    return false;
  };

  const handleReviewClick = (e: React.MouseEvent) => {
    if (!isProcessingComplete()) {
      e.preventDefault();
      setIsProcessingAlertOpen(true);
    }
  };

  const handleClearData = async () => {
    if (!effectiveProjectId) return;
    const success = await clearProjectData(effectiveProjectId);
    if (success) {
      setIsClearDialogOpen(false);
      // Reload processing status to reflect reset
      if (reloadStatus) {
        reloadStatus();
      }
    }
  };

  const handleCreateProject = async (name: string) => {
    const newProject = await createProject({ name });
    if (newProject) {
      setIsCreateModalOpen(false);
      // Navigate to the new project's dashboard
      navigate(`/projects/${newProject.id}`, { replace: true });
    }
  };

  // Show loading state while projects are loading
  if (isProjectsLoadingState && projects.length === 0) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Show empty state if no projects exist
  if (projects.length === 0) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">TrendFinder</h1>
            <p className="mt-2 text-gray-600">Identify trends from your scan hits</p>
          </div>
          <EmptyState
            title="No projects yet"
            message="Create your first project to start identifying trends from your scan hits."
            action={{
              label: 'Create Project',
              onClick: () => setIsCreateModalOpen(true)
            }}
          />
          <CreateProjectModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreate={handleCreateProject}
          />
        </div>
      </Layout>
    );
  }

  // Show loading state while project is being determined
  if (!project) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600">Loading project...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'green';
      case 'error':
        return 'red';
      default:
        return 'blue';
    }
  };

  // Get display status - show "Complete" if all phases are done, even if status field says otherwise
  const getDisplayStatus = () => {
    if (!status) {
      return project.processingStatus || 'Pending';
    }
    
    // Check if all phases are complete
    if (status.totalSignals > 0) {
      const allEmbeddingsDone = status.embeddingsComplete >= status.totalSignals;
      const allSimilaritiesDone = status.embeddingSimilaritiesComplete >= status.totalSignals;
      const allVerificationsDone = status.claudeVerificationsComplete >= status.totalSignals;
      
      if (allEmbeddingsDone && allSimilaritiesDone && allVerificationsDone) {
        return 'Complete';
      }
    }
    
    // Otherwise use the actual status
    if (status.status === 'complete' || status.status === 'error') {
      return status.status === 'complete' ? 'Complete' : 'Error';
    }
    
    // Format status for display (replace underscores with spaces, capitalize)
    return status.status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <div className="text-sm text-gray-600 mb-1">Total Signals</div>
            <div className="text-3xl font-bold text-gray-900">{project.signalCount}</div>
          </Card>
          <Card>
            <div className="text-sm text-gray-600 mb-1">Unprocessed Scan Hits</div>
            <div className="text-3xl font-bold text-gray-900">{unassignedCount}</div>
          </Card>
          <Card>
            <div className="text-sm text-gray-600 mb-1">Total Trends</div>
            <div className="text-3xl font-bold text-gray-900">{project.trendCount}</div>
          </Card>
        </div>

        {status && (() => {
          // Check if processing is actually complete (all phases done)
          const allPhasesComplete = status.totalSignals > 0 && 
            status.embeddingsComplete >= status.totalSignals &&
            status.embeddingSimilaritiesComplete >= status.totalSignals &&
            status.claudeVerificationsComplete >= status.totalSignals;
          
          // Show if processing is in progress OR if complete but user wants to see it
          const isProcessing = !allPhasesComplete;
          const shouldShow = isProcessing || isProcessingProgressExpanded;
          
          if (!shouldShow && allPhasesComplete) {
            // Show collapsed state when complete
            return (
              <Card className="mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">Processing Complete</span>
                  </div>
                  <button
                    onClick={() => setIsProcessingProgressExpanded(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Show Details
                  </button>
                </div>
              </Card>
            );
          }
          
          if (!shouldShow) {
            return null;
          }
          
          return (
            <Card 
              title="Processing Progress" 
              className="mb-6"
              actions={
                allPhasesComplete ? (
                  <button
                    onClick={() => setIsProcessingProgressExpanded(false)}
                    className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Hide
                  </button>
                ) : undefined
              }
            >
              <ProgressBar
                value={status.percentComplete}
                showPercentage={true}
                color={getStatusColor(status.status)}
              />
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Embeddings</div>
                  <div className="font-semibold">{status.embeddingsComplete} / {status.totalSignals}</div>
                </div>
                <div>
                  <div className="text-gray-600">Similarities</div>
                  <div className="font-semibold">{status.embeddingSimilaritiesComplete} / {status.totalSignals}</div>
                </div>
                <div>
                  <div className="text-gray-600">Claude Verification</div>
                  <div className="font-semibold">{status.claudeVerificationsComplete} / {status.totalSignals}</div>
                </div>
              </div>
            </Card>
          );
        })()}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card title="Upload Data">
            <p className="text-sm text-gray-600 mb-4">
              Upload a spreadsheet (Excel or CSV) to import signals for analysis.
            </p>
            {effectiveProjectId ? (
              <Link to={`/projects/${effectiveProjectId}/upload`}>
                <Button variant="primary" className="w-full">
                  Upload Spreadsheet
                </Button>
              </Link>
            ) : (
              <Button variant="primary" className="w-full" disabled>
                Upload Spreadsheet
              </Button>
            )}
          </Card>

          <Card title="Review Scan Hits">
            <p className="text-sm text-gray-600 mb-4">
              Review unassigned scan hits and group similar ones into trends.
            </p>
            {!isProcessingComplete() && status && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800 font-medium">
                  ⏳ Processing in progress... Please wait until processing is complete.
                </p>
              </div>
            )}
            {effectiveProjectId && isProcessingComplete() && project.signalCount > 0 ? (
              <Link to={`/projects/${effectiveProjectId}/review`}>
                <Button variant="primary" className="w-full">
                  Start Review
                </Button>
              </Link>
            ) : (
              <Button 
                variant="primary" 
                className="w-full" 
                disabled={true}
                title={!isProcessingComplete() && status 
                  ? `Processing is ${status.percentComplete}% complete. Please wait until processing finishes before reviewing scan hits.` 
                  : project.signalCount === 0 
                    ? 'No scan hits available. Upload a spreadsheet first.' 
                    : 'Start reviewing and grouping scan hits into trends'}
                onClick={handleReviewClick}
              >
                {!isProcessingComplete() ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : project.signalCount === 0 ? (
                  'No Signals Available'
                ) : (
                  'Start Review'
                )}
              </Button>
            )}
          </Card>

          <Card title="View Trends">
            <p className="text-sm text-gray-600 mb-4">
              View and manage all trends created from your signals.
            </p>
            <Link to={`/projects/${effectiveProjectId}/trends`}>
              <Button variant="secondary" className="w-full">
                View Trends
              </Button>
            </Link>
          </Card>

          <Card title="Manage Signals">
            <p className="text-sm text-gray-600 mb-4">
              View, edit, and manage all signals in this project.
            </p>
            <Link to={`/projects/${effectiveProjectId}/signals`}>
              <Button variant="outline" className="w-full">
                Manage Signals
              </Button>
            </Link>
          </Card>

          <Card title="Export Data">
            <p className="text-sm text-gray-600 mb-4">
              Export trends, signals, or summaries as CSV files.
            </p>
            <Link to={`/projects/${effectiveProjectId}/export`}>
              <Button variant="outline" className="w-full">
                Export Data
              </Button>
            </Link>
          </Card>

          <Card title="Project Settings">
            <p className="text-sm text-gray-600 mb-4">
              Manage project data and settings.
            </p>
            <Button 
              variant="outline" 
              className="w-full text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
              onClick={() => setIsClearDialogOpen(true)}
              disabled={project.signalCount === 0 && project.trendCount === 0}
            >
              Clear All Data
            </Button>
          </Card>
        </div>

        <ClearDataDialog
          isOpen={isClearDialogOpen}
          onClose={() => setIsClearDialogOpen(false)}
          onConfirm={handleClearData}
          projectName={project.name}
          isLoading={isProjectsLoading}
        />

        <Modal
          isOpen={isProcessingAlertOpen}
          onClose={() => setIsProcessingAlertOpen(false)}
          title="⏳ Processing In Progress"
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-yellow-800">
                    Signal processing is still running. Please wait until processing completes before reviewing scan hits.
                  </p>
                </div>
              </div>
            </div>
            
            {status && (
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">Current Status:</div>
                  <div className="text-sm font-medium text-gray-900 capitalize">{status.status.replace('_', ' ')}</div>
                </div>
                <ProgressBar
                  value={status.percentComplete}
                  showPercentage={true}
                  color="blue"
                />
                <div className="mt-3 grid grid-cols-3 gap-4 text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Embeddings:</span> {status.embeddingsComplete} / {status.totalSignals}
                  </div>
                  <div>
                    <span className="font-medium">Similarities:</span> {status.embeddingSimilaritiesComplete} / {status.totalSignals}
                  </div>
                  <div>
                    <span className="font-medium">Verification:</span> {status.claudeVerificationsComplete} / {status.totalSignals}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500 text-center">
                  {status.percentComplete}% complete
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> You can check back on the dashboard to see when processing is complete. The "Review Scan Hits" button will be enabled automatically.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
              <Button
                variant="primary"
                onClick={() => {
                  setIsProcessingAlertOpen(false);
                  // Optionally reload status
                  if (reloadStatus) {
                    reloadStatus();
                  }
                }}
              >
                Got it
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
}
