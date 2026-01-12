import { useParams, useNavigate } from 'react-router-dom';
import { useExport } from '../hooks/useExport';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Layout } from '../components/common/Layout';

export default function Export() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    isLoading,
    error,
    exportTrendsCsv,
    exportSignalsCsv,
    exportSummaryCsv
  } = useExport(projectId || '');

  if (!projectId) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Project not found</h2>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Export Data</h1>
          <p className="mt-2 text-gray-600">Export your project data as CSV files</p>
        </div>

        {error && (
          <ErrorMessage
            message={error}
            onDismiss={() => {}}
            className="mb-6"
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card title="Trends with Signals">
            <p className="text-sm text-gray-600 mb-4">
              Export all trends with their associated signals in a single CSV file.
            </p>
            <Button
              variant="primary"
              onClick={exportTrendsCsv}
              isLoading={isLoading}
              className="w-full"
            >
              Export Trends CSV
            </Button>
          </Card>

          <Card title="All Signals">
            <p className="text-sm text-gray-600 mb-4">
              Export all signals in the project, including their status and trend assignments.
            </p>
            <Button
              variant="primary"
              onClick={exportSignalsCsv}
              isLoading={isLoading}
              className="w-full"
            >
              Export Signals CSV
            </Button>
          </Card>

          <Card title="Trend Summaries">
            <p className="text-sm text-gray-600 mb-4">
              Export only the trend summaries without the associated signals.
            </p>
            <Button
              variant="primary"
              onClick={exportSummaryCsv}
              isLoading={isLoading}
              className="w-full"
            >
              Export Summaries CSV
            </Button>
          </Card>
        </div>

        <Card title="Export Information" className="mt-6">
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              <strong>Trends with Signals:</strong> Includes trend ID, summary, signal count, status, and all associated signal details.
            </p>
            <p>
              <strong>All Signals:</strong> Includes signal ID, text, status, and trend ID (if assigned).
            </p>
            <p>
              <strong>Trend Summaries:</strong> Includes only trend ID, summary, signal count, and status.
            </p>
            <p className="mt-4 text-xs text-gray-500">
              CSV files are downloaded automatically when you click the export buttons above.
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
