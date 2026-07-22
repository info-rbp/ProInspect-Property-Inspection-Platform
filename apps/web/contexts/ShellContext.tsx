import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface ShellNotification {
  id: string;
  title: string;
  message?: string;
  tone: NotificationTone;
}

interface ShellContextValue {
  mobileNavigationOpen: boolean;
  setMobileNavigationOpen: (open: boolean) => void;
  hasPendingChanges: boolean;
  setHasPendingChanges: (pending: boolean) => void;
  notifications: ShellNotification[];
  notify: (notification: Omit<ShellNotification, 'id'>) => void;
  dismissNotification: (id: string) => void;
}

const ShellContext = createContext<ShellContextValue | undefined>(undefined);

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);

  useEffect(() => {
    if (!hasPendingChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);

  const notify = useCallback((notification: Omit<ShellNotification, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications((current) => [...current, { ...notification, id }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const value = useMemo(() => ({
    mobileNavigationOpen,
    setMobileNavigationOpen,
    hasPendingChanges,
    setHasPendingChanges,
    notifications,
    notify,
    dismissNotification,
  }), [dismissNotification, hasPendingChanges, mobileNavigationOpen, notifications, notify]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export const useShell = (): ShellContextValue => {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell must be used within ShellProvider.');
  return context;
};
