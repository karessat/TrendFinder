import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from '../components/projects/ProjectCard';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import { DeleteProjectDialog } from '../components/projects/DeleteProjectDialog';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';
import { Layout } from '../components/common/Layout';

export default function Home() {
  const { projects, isLoading, error, createProject, deleteProject } = useProjects();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; projectId: string; projectName: string }>({
    isOpen: false,
    projectId: '',
    projectName: ''
  });

  const handleCreateProject = async (name: string) => {
    const newProject = await createProject({ name });
    if (newProject) {
      setIsCreateModalOpen(false);
    }
  };

  const handleDeleteClick = (projectId: string, projectName: string) => {
    setDeleteDialog({ isOpen: true, projectId, projectName });
  };

  const handleDeleteConfirm = async () => {
    if (deleteDialog.projectId) {
      await deleteProject(deleteDialog.projectId);
      setDeleteDialog({ isOpen: false, projectId: '', projectName: '' });
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">TrendFinder</h1>
            <p className="mt-2 text-gray-600">Identify trends from your scan hits</p>
          </div>
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create New Project
          </Button>
        </div>

        {error && (
          <ErrorMessage
            message={error}
            onDismiss={() => {}}
            className="mb-6"
          />
        )}

        {isLoading && projects.length === 0 ? (
          <div className="text-center py-12">
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            message="Create your first project to start identifying trends from your scan hits."
            action={{
              label: 'Create Project',
              onClick: () => setIsCreateModalOpen(true)
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={(id) => handleDeleteClick(id, project.name)}
              />
            ))}
          </div>
        )}

        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateProject}
        />

        <DeleteProjectDialog
          isOpen={deleteDialog.isOpen}
          onClose={() => setDeleteDialog({ isOpen: false, projectId: '', projectName: '' })}
          onConfirm={handleDeleteConfirm}
          projectName={deleteDialog.projectName}
        />
      </div>
    </Layout>
  );
}
