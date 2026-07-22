import { useCallback, useMemo } from 'react';
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

  return useMemo(() => ({
    dirty: Boolean(dirtyScopes[scopeId]?.dirty),
    markDirty,
    markClean,
    formProps: { onChangeCapture: markDirty, onInputCapture: markDirty },
  }), [dirtyScopes, markClean, markDirty, scopeId]);
};
