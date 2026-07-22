import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import type { ResourceState } from '../components/layout/PageState';

const isEmpty = (value: unknown): boolean => Array.isArray(value) ? value.length === 0 : value === null || value === undefined;

export const useAsyncResource = <T>(loader: () => Promise<T>, dependencies: DependencyList = []) => {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setIsRefreshing(true);
    else setState({ status: 'loading' });
    try {
      const data = await loaderRef.current();
      setState(isEmpty(data) ? { status: 'empty' } : { status: 'success', data });
    } catch (error) {
      const operational = error as Error & { status?: number };
      if (operational.status === 401 || operational.status === 403) setState({ status: 'permission-denied', error: operational });
      else setState({ status: 'error', error: operational instanceof Error ? operational : new Error('The resource could not be loaded.'), retrySafe: true });
    } finally {
      setIsRefreshing(false);
    }
  }, dependencies);

  useEffect(() => { void load(false); }, [load]);
  return { state, isRefreshing, retry: () => void load(false), refresh: () => void load(true), setState };
};
