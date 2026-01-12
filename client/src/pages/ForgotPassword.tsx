import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { ErrorMessage } from '../components/common/ErrorMessage';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await authApi.forgotPassword({ email });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">TrendFinder</h1>
          <p className="mt-2 text-gray-600">Reset your password</p>
        </div>

        <Card>
          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-800">
                      Password reset email sent!
                    </p>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600">
                If an account with that email exists, we've sent you a password reset link. 
                Please check your email and click the link to reset your password.
              </p>
              
              <p className="text-xs text-gray-500">
                <strong>Note:</strong> The reset link will expire in 1 hour. If you don't see the email, 
                check your spam folder.
              </p>
              
              <div className="pt-4 border-t border-gray-200">
                <Link to="/login">
                  <Button variant="primary" className="w-full">
                    Back to Login
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <ErrorMessage
                  message={error}
                  onDismiss={() => setError(null)}
                />
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="you@example.com"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              <div>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  className="w-full"
                >
                  Send Reset Link
                </Button>
              </div>

              <div className="text-center text-sm">
                <span className="text-gray-600">Remember your password? </span>
                <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                  Sign in
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

