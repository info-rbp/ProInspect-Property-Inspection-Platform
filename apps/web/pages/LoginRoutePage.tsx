import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import LoginPage from '../components/LoginPage';
import { LoadingState } from '../components/layout/AsyncState';
import { useAuth } from '../contexts/AuthContext';

const LoginRoutePage: React.FC = () => {
  const { isAuthenticated, isLoadingAuth, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();

  if (isLoadingAuth) return <div className="min-h-screen bg-gray-50 p-6"><LoadingState title="Checking your session" message="Confirming your identity and agency access." /></div>;
  if (isAuthenticated) return <Navigate to="/app/dashboard" replace state={{ from: location }} />;

  const handleLogin = async (email: string, password: string) => {
    setError(null);
    try {
      await login(email, password);
    } catch {
      setError('Sign-in failed. Check your credentials or contact your agency administrator.');
    }
  };

  return <LoginPage onLogin={handleLogin} error={error} />;
};

export default LoginRoutePage;
