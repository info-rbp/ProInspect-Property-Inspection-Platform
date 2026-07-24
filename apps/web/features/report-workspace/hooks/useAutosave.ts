import { useMemo } from 'react';
import type { WorkspaceSaveState } from '../model/workspaceTypes';

const PRESENTATION: Record<WorkspaceSaveState, { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'bg-ink-100 text-ink-600' },
  saved_locally: { label: 'Saved locally', className: 'bg-amber-100 text-amber-900' },
  synchronising: { label: 'Synchronising', className: 'bg-accent-100 text-accent-800' },
  synchronised: { label: 'Synchronised', className: 'bg-emerald-100 text-emerald-800' },
  conflict: { label: 'Conflict — review required', className: 'bg-red-100 text-red-900' },
  failed: { label: 'Save failed', className: 'bg-red-100 text-red-800' },
};

export const useAutosavePresentation = (state: WorkspaceSaveState) => useMemo(() => PRESENTATION[state], [state]);
