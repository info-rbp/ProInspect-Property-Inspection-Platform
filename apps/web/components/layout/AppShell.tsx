import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShell } from '../../contexts/ShellContext';
import Breadcrumbs from './Breadcrumbs';
import NotificationCenter from './NotificationCenter';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const { hasPendingChanges, mobileNavigationOpen, setHasPendingChanges, setMobileNavigationOpen } = useShell();

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

  const confirmNavigation = (nextPath: string) => {
    if (!hasPendingChanges || window.confirm('You have unsaved changes. Leave this page and discard them?')) {
      setHasPendingChanges(false);
      navigate(nextPath);
    }
  };

  const handleNavigationCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return;
    const nextPath = `${anchor.pathname}${anchor.search}${anchor.hash}`;
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    if (nextPath === currentPath || !hasPendingChanges) return;
    event.preventDefault();
    confirmNavigation(nextPath);
  };

  const handleEditableCapture = (event: React.SyntheticEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const form = target.closest('form');
    if (!form || form.dataset.shellIgnoreDirty === 'true' || target.dataset.shellIgnoreDirty === 'true') return;
    setHasPendingChanges(true);
  };

  return (
    <div onClickCapture={handleNavigationCapture} onChangeCapture={handleEditableCapture} onInputCapture={handleEditableCapture} className="min-h-screen bg-gray-50 text-gray-950 lg:grid lg:grid-cols-[260px_1fr]">
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
    </div>
  );
};

export default AppShell;
