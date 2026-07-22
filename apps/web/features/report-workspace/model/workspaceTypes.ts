import type { ReportAggregate } from '@pcr/domain';

export type WorkspaceSaveState = 'idle' | 'saved_locally' | 'synchronising' | 'synchronised' | 'conflict' | 'failed';

export interface ReportWorkspaceState {
  aggregate?: ReportAggregate;
  selectedAreaId?: string;
  selectedComponentId?: string;
  saveState: WorkspaceSaveState;
  loading: boolean;
  error?: string;
  migrationWarnings: string[];
  dirtyComponentIds: string[];
}

export const initialWorkspaceState: ReportWorkspaceState = {
  saveState: 'idle',
  loading: true,
  migrationWarnings: [],
  dirtyComponentIds: [],
};
