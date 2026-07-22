import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useBlocker, useLocation, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const bypassNextNavigationRef = useRef(false);
  const { clearAll, hasPendingChanges, mobileNavigationOpen, setMobileNavigationOpen } = useShell();
  const { currentUser, userProfile } = useAuth();
  const navigationBlocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypassNextNavigationRef.current) {
      bypassNextNavigationRef.current = false;
      return false;
    }
    return hasPendingChanges && `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}` !== `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
  });

  const protectDirtyLinkNavigation = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasPendingChanges || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin) return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const targetPath = `${target.pathname}${target.search}${target.hash}`;
    if (currentPath === targetPath) return;

    // Own the navigation from here. Preventing the Link first avoids letting a
    // suspended native confirm race React Router's click handler and remount the
    // current route even when the operator chooses to stay.
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm('You have unsaved changes. Leave this page and discard them?')) return;

    bypassNextNavigationRef.current = true;
    clearAll();
    void navigate(targetPath);
  };

  useLayoutEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave this page and discard them?')) {
      clearAll();
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  // Run before the next paint so a blocked link cannot be followed by another
  // form interaction before the user has answered the discard prompt.
  }, [clearAll, navigationBlocker, navigationBlocker.state]);

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
    <div onClickCapture={protectDirtyLinkNavigation} className="min-h-screen bg-gray-50 text-gray-950 lg:grid lg:grid-cols-[260px_1fr]">
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
