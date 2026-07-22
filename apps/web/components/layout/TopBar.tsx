import React, { useEffect, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, HardDrive, Loader2, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useShell } from '../../contexts/ShellContext';
import { getAgency } from '../../services/platform/agencyService';

const getEnvironment = (): { label: string; className: string } => {
  const configured = String(import.meta.env.VITE_APP_ENVIRONMENT || '').toLowerCase();
  if (configured === 'production') return { label: 'Production', className: 'bg-red-100 text-red-800' };
  if (configured === 'staging') return { label: 'Staging', className: 'bg-amber-100 text-amber-800' };
  if (configured === 'development') return { label: 'Development cloud', className: 'bg-blue-100 text-blue-800' };
  return { label: 'Local device mode', className: 'bg-gray-200 text-gray-800' };
};

const TopBar: React.FC = () => {
  const { logout, userProfile } = useAuth();
  const { hasPendingChanges, lastSavedVersion, lastSuccessfulSyncAt, setMobileNavigationOpen, synchronisationStatus } = useShell();
  const [agencyName, setAgencyName] = useState('No agency assigned');
  const environment = getEnvironment();

  useEffect(() => {
    let active = true;
    const resolveAgency = async () => {
      const agencyId = userProfile?.agencyId;
      if (!agencyId) {
        setAgencyName('No agency assigned');
        return;
      }
      if (agencyId === 'unprovisioned-agency') {
        setAgencyName('ProInspect Administration');
        return;
      }
      try {
        const agency = await getAgency(agencyId);
        if (active) setAgencyName(agency?.tradingName || agency?.name || agencyId);
      } catch {
        if (active) setAgencyName(agencyId);
      }
    };
    void resolveAgency();
    return () => { active = false; };
  }, [userProfile?.agencyId]);

  const role = (userProfile?.role || 'inspector').replaceAll('_', ' ');
  const syncPresentation = {
    local: { label: hasPendingChanges ? 'Local changes pending' : 'Saved on this device', className: 'bg-gray-200 text-gray-800', icon: HardDrive },
    synchronised: { label: 'Cloud synchronised', className: 'bg-emerald-100 text-emerald-800', icon: Cloud },
    syncing: { label: 'Synchronising', className: 'bg-blue-100 text-blue-800', icon: Loader2 },
    pending: { label: 'Changes pending', className: 'bg-amber-100 text-amber-800', icon: HardDrive },
    failed: { label: 'Synchronisation failed', className: 'bg-red-100 text-red-800', icon: AlertTriangle },
    offline: { label: 'Offline', className: 'bg-red-100 text-red-800', icon: CloudOff },
  }[synchronisationStatus];
  const SyncIcon = syncPresentation.icon;
  const syncTitle = lastSuccessfulSyncAt
    ? `Last successful synchronisation: ${new Date(lastSuccessfulSyncAt).toLocaleString()}${lastSavedVersion ? `, version ${lastSavedVersion}` : ''}`
    : syncPresentation.label;

  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-950 lg:hidden" type="button" aria-label="Open navigation" onClick={() => setMobileNavigationOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-950">{agencyName}</div>
          <div className="truncate text-xs capitalize text-gray-500">Active role: {role}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${environment.className}`}>{environment.label}</span>
        <span title={syncTitle} aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${syncPresentation.className}`}>
          <SyncIcon size={14} aria-hidden="true" className={synchronisationStatus === 'syncing' ? 'animate-spin' : ''} />
          {syncPresentation.label}
        </span>
        <div className="hidden text-right md:block">
          <div className="text-sm font-semibold text-gray-950">{userProfile?.displayName || userProfile?.email || 'Operator'}</div>
          <div className="text-xs text-gray-500">{userProfile?.email}</div>
        </div>
        <button type="button" onClick={() => logout()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-950">
          <LogOut size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
