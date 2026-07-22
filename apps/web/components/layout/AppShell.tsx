import React, { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useShell } from '../../contexts/ShellContext';
import Breadcrumbs from './Breadcrumbs';
import NotificationCenter from './NotificationCenter';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPendingChanges, mobileNavigationOpen, setHasPendingChanges, setMobileNavigationOpen } = useShell();

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname, setMobileNavigationOpen]);

  const handleNavigationCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasPendingChanges || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return;
    const nextPath = `${anchor.pathname}${anchor.search}${anchor.hash}`;
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    if (nextPath === currentPath) return;

    event.preventDefault();
    if (window.confirm('You have unsaved changes. Leave this page and discard them?')) {
      setHasPendingChanges(false);
      navigate(nextPath);
    }
  };

  return (
    <div onClickCapture={handleNavigationCapture} className="min-h-screen bg-gray-50 text-gray-950 lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main-content" className="sr-only z-[100] rounded bg-gray-950 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
      <div className="hidden lg:block"><Sidebar /></div>
      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Application navigation">
          <button type="button" className="absolute inset-0 bg-gray-950/50" onClick={() => setMobileNavigationOpen(false)} aria-label="Close navigation" />
          <div className="relative h-full w-[min(20rem,88vw)] shadow-2xl"><Sidebar mobile /></div>
        </div>
      ) : null}
      <div className="min-w-0">
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
