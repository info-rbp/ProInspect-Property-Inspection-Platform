import React, { useState } from 'react';

interface LoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  error?: string | null;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="mb-6 text-center">
          <img src="/branding/proinspect-icon.png" alt="ProInspect" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold text-brand-600">ProInspect</h1>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Inspect. Report. Protect.</p>
          <p className="mt-2 text-sm text-gray-500">Sign in with your invited agency account</p>
        </div>
        {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        <form onSubmit={handleSubmit}>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">Email</label>
          <input id="login-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full mt-1 mb-4 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-600" required />
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Password</label>
          <input id="login-password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full mt-1 mb-6 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-600" required />
          <button type="submit" className="w-full bg-accent-600 text-white py-2 rounded-md hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-700 focus:ring-offset-2">Sign in</button>
        </form>
        <p className="text-center text-xs text-gray-500 mt-4">Accounts are invitation-only. Contact your agency administrator for access.</p>
      </div>
    </div>
  );
};

export default LoginPage;
