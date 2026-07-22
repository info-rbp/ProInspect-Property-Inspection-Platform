import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { classifyOperationalFailure, subscribeToShellOperations, type PersistenceMode, type ShellOperationDetail } from '../services/shellEvents';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';
export type SynchronisationStatus = 'local' | 'synchronised' | 'syncing' | 'pending' | 'failed' | 'offline';

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
  synchronisationStatus: SynchronisationStatus;
  persistenceMode: PersistenceMode;
  activeOperationCount: number;
  lastSuccessfulSyncAt?: string;
  lastSavedVersion?: number;
}

const ShellContext = createContext<ShellContextValue | undefined>(undefined);

export const ShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>('local');
  const [activeOperations, setActiveOperations] = useState<Record<string, ShellOperationDetail>>({});
  const [syncFailed, setSyncFailed] = useState(false);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string>();
  const [lastSavedVersion, setLastSavedVersion] = useState<number>();

  const notify = useCallback((notification: Omit<ShellNotification, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications((current) => [...current.slice(-4), { ...notification, id }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  useEffect(() => {
    const updateOnlineState = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!hasPendingChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);

  useEffect(() => subscribeToShellOperations((operation) => {
    if (operation.persistence) setPersistenceMode(operation.persistence);
    if (operation.status === 'started') {
      setActiveOperations((current) => ({ ...current, [operation.id]: operation }));
      if (operation.kind === 'sync' || operation.kind === 'save') setSyncFailed(false);
      return;
    }

    setActiveOperations((current) => {
      const next = { ...current };
      delete next[operation.id];
      return next;
    });

    if (operation.status === 'succeeded') {
      if (operation.kind === 'save' || operation.kind === 'sync') {
        setLastSuccessfulSyncAt(operation.occurredAt);
        setSyncFailed(false);
      }
      if (operation.recordVersion !== undefined) setLastSavedVersion(operation.recordVersion);
      if (operation.clearDirty) setHasPendingChanges(false);
      if (operation.announceSuccess) notify({ title: operation.title, message: operation.message, tone: 'success' });
      return;
    }

    if (operation.kind === 'save' || operation.kind === 'sync') setSyncFailed(true);
    const fallbackKind = classifyOperationalFailure(`${operation.title} ${operation.message || ''}`);
    notify({
      title: operation.title || `${fallbackKind} failed`,
      message: operation.message || 'The operation did not complete. Review the record and try again.',
      tone: 'error',
    });
  }), [notify]);

  useEffect(() => {
    const nativeAlert = window.alert.bind(window);
    window.alert = (value?: unknown) => {
      const message = String(value ?? '');
      const normalized = message.toLowerCase();
      if (/failed|failure|error|unable/.test(normalized)) {
        const kind = classifyOperationalFailure(message);
        if (kind === 'save' || kind === 'sync') setSyncFailed(true);
        notify({ title: `${kind === 'analysis' ? 'AI analysis' : kind} failed`, message, tone: 'error' });
      } else if (/report saved/.test(normalized)) {
        const mode: PersistenceMode = /cloud/.test(normalized) ? 'cloud' : 'local';
        setPersistenceMode(mode);
        setLastSuccessfulSyncAt(new Date().toISOString());
        setSyncFailed(false);
        setHasPendingChanges(false);
        notify({ title: 'Report saved', message, tone: 'success' });
      }
      nativeAlert(value);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason || 'An operation failed unexpectedly.');
      const kind = classifyOperationalFailure(message);
      notify({ title: `${kind} failed`, message, tone: 'error' });
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.alert = nativeAlert;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [notify]);

  useEffect(() => {
    if (!hasPendingChanges) return undefined;
    const handlePopState = () => {
      if (!window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        window.history.go(1);
      } else {
        setHasPendingChanges(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasPendingChanges]);

  const synchronisationStatus = useMemo<SynchronisationStatus>(() => {
    if (!online) return 'offline';
    const activeValues = Object.values(activeOperations);
    if (activeValues.some((operation) => operation.kind === 'sync' || operation.kind === 'save')) return 'syncing';
    if (syncFailed) return 'failed';
    if (hasPendingChanges) return 'pending';
    return persistenceMode === 'cloud' && lastSuccessfulSyncAt ? 'synchronised' : 'local';
  }, [activeOperations, hasPendingChanges, lastSuccessfulSyncAt, online, persistenceMode, syncFailed]);

  const value = useMemo(() => ({
    mobileNavigationOpen,
    setMobileNavigationOpen,
    hasPendingChanges,
    setHasPendingChanges,
    notifications,
    notify,
    dismissNotification,
    synchronisationStatus,
    persistenceMode,
    activeOperationCount: Object.keys(activeOperations).length,
    lastSuccessfulSyncAt,
    lastSavedVersion,
  }), [activeOperations, dismissNotification, hasPendingChanges, lastSavedVersion, lastSuccessfulSyncAt, mobileNavigationOpen, notifications, notify, persistenceMode, synchronisationStatus]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export const useShell = (): ShellContextValue => {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell must be used within ShellProvider.');
  return context;
};
