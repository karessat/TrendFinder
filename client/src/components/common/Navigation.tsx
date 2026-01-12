import { Link, useLocation } from 'react-router-dom';

export function Navigation() {
  const location = useLocation();
  // Check if we're on any project-related page
  const isProjectPage = location.pathname.startsWith('/projects/');
  
  // Extract projectId from pathname (e.g., /projects/123/upload -> 123)
  const projectIdMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectIdMatch ? projectIdMatch[1] : null;
  
  // Dashboard link: always link to home (/) which shows the dashboard
  const dashboardLink = '/';
  const showDashboardLink = isProjectPage;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link 
              to="/"
              className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
            >
              <h1 className="text-xl font-bold">TrendFinder</h1>
            </Link>
          </div>
          
          <div className="flex items-center space-x-4">
            {showDashboardLink && (
              <Link
                to={dashboardLink}
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-gray-50"
              >
                ← Dashboard
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

