import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, HardDrive, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useShell } from '../../contexts/ShellContext';

const getEnvironment = (): { label: string; className: string } => {
  const configured = String(import.meta.env.VITE_APP_ENVIRONMENT || '').toLowerCase();
  if (configured === 'production') return { label: 'Production', className: 'bg-red-100 text-red-800' };
  if (configured === 'staging') return { label: 'Staging', className: 'bg-amber-100 text-amber-800' };
  if (configured === 'development') return { label: 'Development cloud', className: 'bg-blue-100 text-blue-800' };
  return { label: 'Local device mode', className: 'bg-gray-200 text-gray-800' };
};

const TopBar: React.FC = () => {
  const { logout, userProfile } = useAuth();
  const { hasPendingChanges, setMobileNavigationOpen } = useShell();
  const [online, setOnline] = useState(navigator.onLine);
  const environment = getEnvironment();

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const role = (userProfile?.role || 'inspector').replaceAll('_', ' ');
  const agency = userProfile?.agencyId || 'No agency assigned';

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-950 lg:hidden" type="button" aria-label="Open navigation" onClick={() => setMobileNavigationOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-950">{agency}</div>
          <div className="truncate text-xs capitalize text-gray-500">Active role: {role}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${environment.className}`}>{environment.label}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
          {online ? <Cloud size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
          {online ? (hasPendingChanges ? 'Changes pending' : 'Online / synchronised') : 'Offline'}
        </span>
        {hasPendingChanges ? <HardDrive size={16} className="text-amber-600" aria-label="Unsaved changes" /> : null}
        <div className="hidden text-right md:block">
          <div className="text-sm font-semibold text-gray-950">{userProfile?.displayName || userProfile?.email || 'Operator'}</div>
          <div className="text-xs text-gray-500">{userProfile?.email}</div>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-950"
        >
          <LogOut size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
