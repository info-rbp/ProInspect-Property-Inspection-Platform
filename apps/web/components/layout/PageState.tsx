import React from 'react';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from './AsyncState';

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'permission-denied'; error?: Error }
  | { status: 'error'; error: Error; retrySafe: boolean };

interface PageStateProps<T> {
  state: ResourceState<T>;
  children: (data: T) => React.ReactNode;
  resourceName: string;
  emptyTitle: string;
  emptyMessage: string;
  emptyAction?: React.ReactNode;
  onRetry?: () => void;
  isRefreshing?: boolean;
}

const PageState = <T,>({ state, children, resourceName, emptyTitle, emptyMessage, emptyAction, onRetry, isRefreshing }: PageStateProps<T>) => {
  if (state.status === 'loading') return <LoadingState title={`Loading ${resourceName}`} message={`Retrieving the latest ${resourceName}.`} />;
  if (state.status === 'empty') return <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />;
  if (state.status === 'permission-denied') return <PermissionDeniedState message={`Your role does not allow access to these ${resourceName}.`} />;
  if (state.status === 'error') return <ErrorState title={`${resourceName} unavailable`} message={state.error.message} action={state.retrySafe && onRetry ? <button type="button" onClick={onRetry} className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Retry</button> : undefined} />;
  return <>{isRefreshing ? <div role="status" className="mb-2 text-xs text-gray-500">Refreshing {resourceName}…</div> : null}{children(state.data)}</>;
};

export default PageState;
