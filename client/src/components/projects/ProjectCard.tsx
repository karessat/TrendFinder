import { Link } from 'react-router-dom';
import { ProjectListItem } from '../../types';

interface ProjectCardProps {
  project: ProjectListItem;
  onDelete?: (id: string) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Link
            to={`/projects/${project.id}`}
            className="text-xl font-semibold text-gray-900 hover:text-blue-600 transition-colors"
          >
            {project.name}
          </Link>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
            <span>{project.signalCount} signals</span>
            <span>{project.trendCount} trends</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.processingStatus)}`}>
              {project.processingStatus}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Created {new Date(project.createdAt).toLocaleDateString()}
          </div>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(project.id)}
            className="ml-4 text-red-600 hover:text-red-800 focus:outline-none"
            title="Delete project"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}


