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
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 backdrop-blur-sm bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link 
              to="/"
              className="flex items-center space-x-2 text-gray-900 hover:text-primary-600 transition-colors duration-200 group"
            >
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent group-hover:from-primary-700 group-hover:to-primary-800 transition-all">
                TrendFinder
              </h1>
            </Link>
          </div>
          
          <div className="flex items-center space-x-4">
            {showDashboardLink && (
              <Link
                to={dashboardLink}
                className="text-gray-600 hover:text-primary-600 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-primary-50 hover:shadow-sm"
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

