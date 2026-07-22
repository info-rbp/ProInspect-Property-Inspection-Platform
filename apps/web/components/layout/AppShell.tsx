import React, { useEffect, useRef } from 'react';
import { Outlet, useBlocker, useLocation } from 'react-router-dom';
import { useShell } from '../../contexts/ShellContext';
import Breadcrumbs from './Breadcrumbs';
import NotificationCenter from './NotificationCenter';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import SyncQueuePanel from '../sync/SyncQueuePanel';
import ConflictResolutionDialog from '../sync/ConflictResolutionDialog';
import { useAuth } from '../../contexts/AuthContext';
import { installSyncCoordinator } from '../../services/offline/syncCoordinator';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const AppShell: React.FC = () => {
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const { clearAll, hasPendingChanges, mobileNavigationOpen, setMobileNavigationOpen } = useShell();
  const { currentUser, userProfile } = useAuth();
  const navigationBlocker = useBlocker(({ currentLocation, nextLocation }) => (
    hasPendingChanges && `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}` !== `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`
  ));

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave this page and discard them?')) {
      clearAll();
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [clearAll, navigationBlocker]);

  useEffect(() => {
    const agencyId = userProfile?.agencyId;
    if (!currentUser || !agencyId) return undefined;
    return installSyncCoordinator(currentUser.uid, agencyId);
  }, [currentUser, userProfile]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname, setMobileNavigationOpen]);

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavigationOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const items = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocusedRef.current?.focus();
    };
  }, [mobileNavigationOpen, setMobileNavigationOpen]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950 lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main-content" className="sr-only z-[100] rounded bg-gray-950 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
      <div className="hidden lg:block"><Sidebar /></div>
      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Application navigation">
          <button type="button" className="absolute inset-0 bg-gray-950/50" onClick={() => setMobileNavigationOpen(false)} aria-label="Dismiss navigation backdrop" />
          <div ref={drawerRef} className="relative h-full w-[min(20rem,88vw)] shadow-2xl"><Sidebar mobile /></div>
        </div>
      ) : null}
      <div className="min-w-0" aria-hidden={mobileNavigationOpen ? true : undefined}>
        <TopBar />
        <main id="main-content" tabIndex={-1} className="p-4 outline-none lg:p-6">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
      <NotificationCenter />
      <SyncQueuePanel />
      <ConflictResolutionDialog />
    </div>
  );
};

export default AppShell;
