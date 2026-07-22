import { useCallback, useMemo, type SyntheticEvent } from 'react';
import { useShell, type DirtyEntityType } from '../contexts/ShellContext';

export interface UseDirtyFormOptions {
  scopeId: string;
  entityType: DirtyEntityType;
  entityId?: string;
}

export const useDirtyForm = ({ scopeId, entityType, entityId }: UseDirtyFormOptions) => {
  const { dirtyScopes, markClean: markScopeClean, markDirty: markScopeDirty } = useShell();
  const markDirty = useCallback(() => {
    markScopeDirty({ id: scopeId, entityType, entityId, dirty: true });
  }, [entityId, entityType, markScopeDirty, scopeId]);
  const markClean = useCallback(() => markScopeClean(scopeId), [markScopeClean, scopeId]);
  const handleDirtyCapture = useCallback((event: SyntheticEvent<HTMLElement>) => {
    const owner = (event.target as HTMLElement).closest<HTMLElement>('[data-dirty-scope]');
    if (owner && owner.dataset.dirtyScope !== scopeId) return;
    markDirty();
  }, [markDirty, scopeId]);

  return useMemo(() => ({
    dirty: Boolean(dirtyScopes[scopeId]?.dirty),
    markDirty,
    markClean,
    formProps: { 'data-dirty-scope': scopeId, onChangeCapture: handleDirtyCapture, onInputCapture: handleDirtyCapture },
  }), [dirtyScopes, handleDirtyCapture, markClean, markDirty, scopeId]);
};
