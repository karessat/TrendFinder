import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi } from '../services/api';
import { FileUploader } from '../components/upload/FileUploader';
import { ColumnMappingSelector } from '../components/upload/ColumnMappingSelector';
import { ProcessingProgress } from '../components/upload/ProcessingProgress';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { useProcessingStatus } from '../hooks/useProcessingStatus';
import { UploadPreview, ColumnMappings, UploadResponse } from '../types';
import { Layout } from '../components/common/Layout';

export default function Upload() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Always check processing status
  const { status: processingStatus } = useProcessingStatus(projectId || '', !!projectId);

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

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setPreview(null);

    // Get preview with detected mappings
    if (!projectId) return;

    setIsPreviewing(true);
    try {
      const response = await projectsApi.uploadPreview(projectId, selectedFile);
      setPreview(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview file');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmMapping = async (mappings: ColumnMappings) => {
    if (!file || !projectId) return;

    setIsUploading(true);
    setError(null);
    try {
      const response = await projectsApi.upload(projectId, file, mappings);
      setUploadResult(response.data);
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelMapping = () => {
    setPreview(null);
    setFile(null);
  };

  const handleProcessingComplete = () => {
    navigate(`/projects/${projectId}/review`);
  };

  // Calculate estimated processing time
  const getEstimatedTime = (signalCount: number): string => {
    // Rough estimates: 
    // Phase 1 (Embeddings): ~0.1-0.2 seconds per signal
    // Phase 2 (Similarities): ~0.05 seconds per signal
    // Phase 3 (Claude): ~2-3 seconds per signal (with rate limiting)
    // Total: ~2.5-3.5 seconds per signal on average
    const secondsPerSignal = 3;
    const totalSeconds = signalCount * secondsPerSignal;
    const minutes = Math.ceil(totalSeconds / 60);
    
    if (minutes < 1) {
      return 'less than a minute';
    } else if (minutes === 1) {
      return 'about 1 minute';
    } else if (minutes < 60) {
      return `about ${minutes} minutes`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      }
      return `about ${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Upload Spreadsheet</h1>
        </div>

        {error && (
          <ErrorMessage
            message={error}
            onDismiss={() => setError(null)}
            className="mb-6"
          />
        )}

        {/* Show processing status if active, even when no upload just completed */}
        {processingStatus && processingStatus.status !== 'complete' && !uploadResult && (
          <Card title={processingStatus.status === 'error' ? 'Processing Error' : processingStatus.status === 'pending' ? 'Processing Pending' : 'Processing in Progress'} className="mb-6">
            {processingStatus.status === 'pending' && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800 mb-3">
                  <strong>Processing has not started yet.</strong>
                </p>
                <p className="text-sm text-yellow-700 mb-3">
                  Click the button below to start processing your signals.
                </p>
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      await projectsApi.resumeProcessing(projectId || '');
                      // Refresh status
                      window.location.reload();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to start processing');
                    }
                  }}
                >
                  Start Processing
                </Button>
              </div>
            )}
            {processingStatus.status !== 'pending' && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Processing {processingStatus.status === 'error' ? 'encountered an error' : 'is running in the background'}.</strong>
                </p>
                <p className="text-sm text-blue-700">
                  Your data is being processed through three phases: generating embeddings, calculating similarities, and verifying with Claude. 
                  This process can take some time depending on the number of signals. You can continue uploading more files or leave this page - 
                  processing will continue in the background.
                </p>
                {processingStatus?.totalSignals && (
                  <p className="text-xs text-blue-600 mt-2">
                    Estimated total processing time: {getEstimatedTime(processingStatus.totalSignals)}
                  </p>
                )}
                {/* Show resume button if processing is stuck (error status, or claude_verification with 0 progress) */}
                {(processingStatus.status === 'error' || 
                  (processingStatus.status === 'claude_verification' && processingStatus.claudeVerificationsComplete === 0)) && (
                  <div className="mt-3">
                    <Button
                      variant="primary"
                      onClick={async () => {
                        try {
                          await projectsApi.resumeProcessing(projectId || '');
                          // Refresh status after a short delay
                          setTimeout(() => {
                            window.location.reload();
                          }, 1000);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to resume processing');
                        }
                      }}
                    >
                      {processingStatus.status === 'error' ? 'Retry Processing' : 'Resume Processing'}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <ProcessingProgress
              projectId={projectId || ''}
              onComplete={handleProcessingComplete}
            />
          </Card>
        )}

        {!uploadResult ? (
          preview ? (
            <Card title="Configure Column Mappings">
              <ColumnMappingSelector
                preview={preview}
                onConfirm={handleConfirmMapping}
                onCancel={handleCancelMapping}
                isLoading={isUploading || isPreviewing}
              />
            </Card>
          ) : (
            <Card title="Select File">
              <FileUploader
                onFileSelect={handleFileSelect}
                isLoading={isPreviewing}
              />
              {file && !preview && (
                <div className="mt-4 text-sm text-gray-600">
                  Analyzing file structure...
                </div>
              )}
            </Card>
          )
        ) : (
          <Card title="Processing Status">
            {uploadResult && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800 mb-2">
                  <strong>Upload successful!</strong> {uploadResult.signalCount} signals imported.
                </p>
                <p className="text-xs text-green-700 mb-3">
                  {uploadResult.detectedColumn && `Detected column: ${uploadResult.detectedColumn} | `}
                  Estimated cost: {uploadResult.estimatedCost} | 
                  Estimated processing time: {getEstimatedTime(uploadResult.signalCount)}
                </p>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800 mb-1">
                    <strong>Processing your data...</strong>
                  </p>
                  <p className="text-xs text-blue-700">
                    Your signals are being processed through three phases: generating embeddings, calculating similarities, and verifying with Claude. 
                    This typically takes {getEstimatedTime(uploadResult.signalCount)} for {uploadResult.signalCount} signals. 
                    Processing continues in the background - you can leave this page and return later.
                  </p>
                </div>
                {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm font-medium text-yellow-800 mb-1">Warnings:</p>
                    <ul className="text-xs text-yellow-700 list-disc list-inside">
                      {uploadResult.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <ProcessingProgress
              projectId={projectId || ''}
              onComplete={handleProcessingComplete}
            />
          </Card>
        )}
      </div>
    </Layout>
  );
}
