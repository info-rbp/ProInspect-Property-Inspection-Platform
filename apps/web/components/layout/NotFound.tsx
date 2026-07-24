import React from 'react';
import { Link } from 'react-router-dom';

const NotFound: React.FC = () => (
  <div className="min-h-screen grid place-items-center bg-gray-50 p-8">
    <div className="max-w-md text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">404</p>
      <h1 className="mt-2 text-3xl font-bold text-brand-600">Page not found</h1>
      <p className="mt-3 text-sm text-gray-600">This ProInspect route does not exist.</p>
      <Link to="/app/dashboard" className="mt-6 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        Back to dashboard
      </Link>
    </div>
  </div>
);

export default NotFound;
