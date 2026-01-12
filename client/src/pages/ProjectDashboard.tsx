import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useProcessingStatus } from '../hooks/useProcessingStatus';
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
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isProcessingAlertOpen, setIsProcessingAlertOpen] = useState(false);

  const project = effectiveProjectId ? projects.find(p => p.id === effectiveProjectId) : null;
  
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
    // Processing is complete if status is 'complete' or 'error'
    // 'error' means processing failed, but signals may still be reviewable
    return status.status === 'complete' || status.status === 'error';
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
            <div className="text-sm text-gray-600 mb-1">Total Trends</div>
            <div className="text-3xl font-bold text-gray-900">{project.trendCount}</div>
          </Card>
          <Card>
            <div className="text-sm text-gray-600 mb-1">Processing Status</div>
            <div className="text-lg font-semibold text-gray-900 capitalize">{project.processingStatus}</div>
          </Card>
        </div>

        {status && status.status !== 'complete' && status.status !== 'error' && (
          <Card title="Processing Progress" className="mb-6">
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
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card title="Upload Data">
            <p className="text-sm text-gray-600 mb-4">
              Upload a spreadsheet (Excel or CSV) to import signals for analysis.
            </p>
            <Link to={`/projects/${effectiveProjectId}/upload`}>
              <Button variant="primary" className="w-full">
                Upload Spreadsheet
              </Button>
            </Link>
          </Card>

          <Card title="Review Signals">
            <p className="text-sm text-gray-600 mb-4">
              Review unassigned signals and group similar ones into trends.
            </p>
            {!isProcessingComplete() && status && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  Processing in progress... Please wait until processing is complete.
                </p>
              </div>
            )}
            <Link 
              to={`/projects/${effectiveProjectId}/review`}
              onClick={handleReviewClick}
              className={!isProcessingComplete() ? 'pointer-events-none' : ''}
            >
              <Button 
                variant="primary" 
                className="w-full" 
                disabled={project.signalCount === 0 || !isProcessingComplete()}
              >
                {!isProcessingComplete() ? 'Processing...' : 'Start Review'}
              </Button>
            </Link>
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
          title="Processing In Progress"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              The signal processing is still in progress. Please wait until processing is complete before reviewing signals.
            </p>
            {status && (
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm font-semibold text-gray-700 mb-2">Current Status:</div>
                <div className="text-sm text-gray-600 capitalize mb-3">{status.status}</div>
                <ProgressBar
                  value={status.percentComplete}
                  showPercentage={true}
                  color="blue"
                />
                <div className="mt-3 text-xs text-gray-500">
                  {status.percentComplete}% complete
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setIsProcessingAlertOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
}
