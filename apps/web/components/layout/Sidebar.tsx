import React from 'react';
import { NavLink } from 'react-router-dom';
import { BriefcaseBusiness, Building2, ClipboardList, ContactRound, FileText, Gauge, Home, KeyRound, ListChecks, Settings, Users, Wrench, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useShell } from '../../contexts/ShellContext';
import type { InternalSection } from '../../services/platform/roleAccess';

interface NavItem { label: string; to: string; section: InternalSection; icon: React.ComponentType<{ size?: number }>; }

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/app/dashboard', section: 'dashboard', icon: Gauge },
  { label: 'Properties', to: '/app/admin/properties', section: 'properties', icon: Home },
  { label: 'Clients', to: '/app/admin/clients', section: 'properties', icon: ContactRound },
  { label: 'Tenancies', to: '/app/admin/tenancies', section: 'properties', icon: KeyRound },
  { label: 'Inspection Jobs', to: '/app/admin/jobs', section: 'jobs', icon: ClipboardList },
  { label: 'Work Queue', to: '/app/admin/work-queue', section: 'jobs', icon: ListChecks },
  { label: 'Reports', to: '/app/admin/reports', section: 'reports', icon: FileText },
  { label: 'Service Operations', to: '/app/admin/operations', section: 'operations', icon: BriefcaseBusiness },
  { label: 'Users', to: '/app/admin/users', section: 'users', icon: Users },
  { label: 'Agency', to: '/app/admin/agency', section: 'settings', icon: Building2 },
  { label: 'Templates', to: '/app/admin/templates', section: 'templates', icon: Wrench },
  { label: 'Settings', to: '/app/admin/settings', section: 'settings', icon: Settings },
];

const Sidebar: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => {
  const { canAccess, userProfile } = useAuth();
  const { setMobileNavigationOpen } = useShell();
  const visibleItems = NAV_ITEMS.filter((item) => canAccess(item.section));
  const release = import.meta.env.VITE_APP_VERSION || 'Development build';
  return <aside className="relative flex h-full min-h-screen flex-col border-r border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen">
    <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-5"><img src="/branding/proinspect-icon.png" alt="" aria-hidden="true" className="h-9 w-9 shrink-0" /><div className="min-w-0 flex-1"><div className="text-sm font-bold text-brand-600">ProInspect</div><div className="truncate text-xs text-gray-500">Inspect. Report. Protect.</div></div>{mobile ? <button type="button" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600" onClick={() => setMobileNavigationOpen(false)} aria-label="Close navigation"><X size={20} /></button> : null}</div>
    <nav aria-label="Primary navigation" className="grid gap-1 p-3">{visibleItems.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} className={({ isActive }) => ['flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2', isActive ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-brand-600'].join(' ')}><Icon size={18} aria-hidden="true" />{item.label}</NavLink>; })}</nav>
    <section className="mx-3 mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700" aria-label="System status"><div className="font-bold text-brand-600">System status</div><div className="mt-1">Release: {release}</div><div className="mt-1">Agency: {userProfile?.agencyId || 'Not assigned'}</div></section>
    <div className="mt-auto m-3 rounded-lg border border-gray-200 p-3 text-xs text-gray-500"><BriefcaseBusiness size={16} className="mb-2" aria-hidden="true" />Internal ProInspect workspace</div>
  </aside>;
};
export default Sidebar;
