import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProcessingStatus } from '../../hooks/useProcessingStatus';
import { ProgressBar } from '../common/ProgressBar';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';

interface ProcessingProgressProps {
  projectId: string;
  onComplete?: () => void;
}

export function ProcessingProgress({ projectId, onComplete }: ProcessingProgressProps) {
  const navigate = useNavigate();
  const { status, isLoading, error, resumeProcessing, retryFailedVerifications } = useProcessingStatus(projectId, true);

  useEffect(() => {
    if (status?.status === 'complete' && onComplete) {
      onComplete();
    }
  }, [status?.status, onComplete]);

  if (!status) {
    return (
      <div className="text-center py-8">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-600">Loading processing status...</p>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {status.currentPhase}
        </h3>
        <ProgressBar
          value={status.percentComplete}
          showPercentage={true}
          color={status.status === 'error' ? 'red' : 'blue'}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-sm text-gray-600 mb-1">Phase 1: Embeddings</div>
          <div className="text-lg font-semibold">
            {status.embeddingsComplete} / {status.totalSignals}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Phase 2: Similarities</div>
          <div className="text-lg font-semibold">
            {status.embeddingSimilaritiesComplete} / {status.totalSignals}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Phase 3: Claude Verification</div>
          <div className="text-lg font-semibold">
            {status.claudeVerificationsComplete} / {status.totalSignals}
          </div>
          {status.claudeVerificationFailures > 0 && (
            <div className="text-sm text-red-600 mt-1">
              {status.claudeVerificationFailures} failures
            </div>
          )}
        </div>
      </div>

      {status.estimatedSecondsRemaining && (
        <div className="text-sm text-gray-600">
          Estimated time remaining: {Math.ceil(status.estimatedSecondsRemaining / 60)} minutes
        </div>
      )}

      {status.status === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800 mb-3">
            {status.errorMessage || 'An error occurred during processing'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={resumeProcessing}
              isLoading={isLoading}
            >
              Resume Processing
            </Button>
            {status.claudeVerificationFailures > 0 && (
              <Button
                variant="secondary"
                onClick={retryFailedVerifications}
                isLoading={isLoading}
              >
                Retry Failed Verifications
              </Button>
            )}
          </div>
        </div>
      )}

      {status.status === 'complete' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800 mb-3">
            Processing complete! All signals have been processed.
          </p>
          <Button
            variant="primary"
            onClick={() => navigate(`/projects/${projectId}/review`)}
          >
            Start Reviewing Signals
          </Button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

