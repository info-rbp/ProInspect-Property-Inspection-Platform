import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { classifyOperationalFailure, subscribeToShellOperations, type PersistenceMode, type ShellOperationDetail } from '../services/shellEvents';
import { hasDirtyScopes, markCleanScope, markDirtyScope } from '../services/dirtyState';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';
export type SynchronisationStatus = 'local' | 'synchronised' | 'syncing' | 'pending' | 'failed' | 'offline';

export interface ShellNotification {
  id: string;
  title: string;
  message?: string;
  tone: NotificationTone;
}

export type DirtyEntityType = 'property' | 'job' | 'report' | 'template' | 'user' | 'settings';

export interface DirtyScope {
  id: string;
  entityType: DirtyEntityType;
  entityId?: string;
  dirty: boolean;
}

export interface ShellContextValue {
  mobileNavigationOpen: boolean;
  setMobileNavigationOpen: (open: boolean) => void;
  hasPendingChanges: boolean;
  dirtyScopes: Record<string, DirtyScope>;
  markDirty: (scope: DirtyScope) => void;
  markClean: (scopeId: string) => void;
  clearAll: () => void;
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
  const [dirtyScopes, setDirtyScopes] = useState<Record<string, DirtyScope>>({});
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>('local');
  const [activeOperations, setActiveOperations] = useState<Record<string, ShellOperationDetail>>({});
  const [syncFailed, setSyncFailed] = useState(false);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string>();
  const [lastSavedVersion, setLastSavedVersion] = useState<number>();
  const hasPendingChanges = useMemo(() => hasDirtyScopes(dirtyScopes), [dirtyScopes]);

  const markDirty = useCallback((scope: DirtyScope) => {
    setDirtyScopes((current) => markDirtyScope(current, scope));
  }, []);

  const markClean = useCallback((scopeId: string) => {
    setDirtyScopes((current) => markCleanScope(current, scopeId));
  }, []);

  const clearAll = useCallback(() => setDirtyScopes({}), []);

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
      if (operation.dirtyScopeId) markClean(operation.dirtyScopeId);
      if (operation.announceSuccess) notify({ title: operation.title, message: operation.message, tone: 'success' });
      return;
    }

    if (operation.kind === 'save' || operation.kind === 'sync') setSyncFailed(true);
    const fallbackKind = classifyOperationalFailure(`${operation.title} ${operation.message || ''}`);
    notify({
      title: operation.title || `${fallbackKind} failed`,
      message: `${operation.message || 'The operation did not complete. Review the record and try again.'}${operation.correlationId ? ` Support reference: ${operation.correlationId}.` : ''}`,
      tone: 'error',
    });
  }), [markClean, notify]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason || 'An operation failed unexpectedly.');
      const kind = classifyOperationalFailure(message);
      notify({ title: `${kind} failed`, message, tone: 'error' });
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [notify]);

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
    dirtyScopes,
    markDirty,
    markClean,
    clearAll,
    notifications,
    notify,
    dismissNotification,
    synchronisationStatus,
    persistenceMode,
    activeOperationCount: Object.keys(activeOperations).length,
    lastSuccessfulSyncAt,
    lastSavedVersion,
  }), [activeOperations, clearAll, dirtyScopes, dismissNotification, hasPendingChanges, lastSavedVersion, lastSuccessfulSyncAt, markClean, markDirty, mobileNavigationOpen, notifications, notify, persistenceMode, synchronisationStatus]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
};

export const useShell = (): ShellContextValue => {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell must be used within ShellProvider.');
  return context;
};
