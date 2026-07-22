import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const LABELS: Record<string, string> = {
  app: 'Workspace',
  admin: 'Administration',
  properties: 'Properties',
  jobs: 'Inspection Jobs',
  reports: 'Reports',
  users: 'Users',
  templates: 'Templates',
  settings: 'Settings',
  edit: 'Edit',
  preview: 'Preview',
};

const Breadcrumbs: React.FC = () => {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 text-sm text-gray-600">
        <li>
          <Link to="/app/dashboard" className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-950">
            <Home size={14} aria-hidden="true" />
            Dashboard
          </Link>
        </li>
        {segments.slice(2).map((segment, index) => {
          const absoluteIndex = index + 2;
          const to = `/${segments.slice(0, absoluteIndex + 1).join('/')}`;
          const isLast = absoluteIndex === segments.length - 1;
          const label = LABELS[segment] || (segment.length > 18 ? 'Details' : segment.replaceAll('-', ' '));
          return (
            <React.Fragment key={to}>
              <li aria-hidden="true"><ChevronRight size={14} /></li>
              <li>
                {isLast ? (
                  <span aria-current="page" className="font-semibold capitalize text-gray-950">{label}</span>
                ) : (
                  <Link to={to} className="rounded px-1 py-1 capitalize hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-950">{label}</Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
