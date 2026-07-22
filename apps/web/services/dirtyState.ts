import type { DirtyScope } from '../contexts/ShellContext';

export const markDirtyScope = (current: Record<string, DirtyScope>, scope: DirtyScope): Record<string, DirtyScope> => ({
  ...current,
  [scope.id]: { ...scope, dirty: true },
});

export const markCleanScope = (current: Record<string, DirtyScope>, scopeId: string): Record<string, DirtyScope> => {
  if (!current[scopeId]) return current;
  const next = { ...current };
  delete next[scopeId];
  return next;
};

export const hasDirtyScopes = (scopes: Record<string, DirtyScope>): boolean => Object.values(scopes).some((scope) => scope.dirty);
