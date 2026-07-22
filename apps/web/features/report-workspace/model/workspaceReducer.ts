import type { ReportAggregate } from '@pcr/domain';
import type { ReportWorkspaceState, WorkspaceSaveState } from './workspaceTypes';

type WorkspaceComponent = ReportAggregate['areas'][number]['components'][number];

export type WorkspaceAction =
  | { type: 'loaded'; aggregate: ReportAggregate; migrationWarnings?: string[] }
  | { type: 'failed'; message: string }
  | { type: 'select_area'; areaId: string }
  | { type: 'select_component'; areaId: string; componentId: string }
  | { type: 'update_component'; areaId: string; componentId: string; patch: Partial<WorkspaceComponent> }
  | { type: 'component_saved'; areaId: string; component: WorkspaceComponent; workspaceRevision?: number }
  | { type: 'save_state'; saveState: WorkspaceSaveState }
  | { type: 'replace'; aggregate: ReportAggregate };

export function workspaceReducer(state: ReportWorkspaceState, action: WorkspaceAction): ReportWorkspaceState {
  if (action.type === 'failed') return { ...state, loading: false, error: action.message, saveState: 'failed' };
  if (action.type === 'loaded') {
    const selectedAreaId = action.aggregate.areas[0]?.id;
    return {
      ...state, aggregate: action.aggregate, loading: false, error: undefined,
      selectedAreaId, selectedComponentId: action.aggregate.areas[0]?.components[0]?.id,
      migrationWarnings: action.migrationWarnings ?? [], saveState: 'synchronised', dirtyComponentIds: [],
    };
  }
  if (action.type === 'replace') return { ...state, aggregate: action.aggregate };
  if (action.type === 'save_state') return { ...state, saveState: action.saveState };
  if (action.type === 'select_area') {
    const area = state.aggregate?.areas.find((candidate) => candidate.id === action.areaId);
    return { ...state, selectedAreaId: action.areaId, selectedComponentId: area?.components[0]?.id };
  }
  if (action.type === 'select_component') return { ...state, selectedAreaId: action.areaId, selectedComponentId: action.componentId };
  if (!state.aggregate) return state;
  if (action.type === 'update_component' || action.type === 'component_saved') {
    const componentId = action.type === 'update_component' ? action.componentId : action.component.id;
    const areas = state.aggregate.areas.map((area) => area.id !== action.areaId ? area : {
      ...area,
      components: area.components.map((component) => component.id !== componentId ? component : action.type === 'update_component' ? { ...component, ...action.patch } : action.component),
    });
    const dirty = new Set(state.dirtyComponentIds);
    if (action.type === 'update_component') dirty.add(componentId); else dirty.delete(componentId);
    return {
      ...state,
      aggregate: { ...state.aggregate, report: { ...state.aggregate.report, ...(action.type === 'component_saved' && action.workspaceRevision ? { workspaceRevision: action.workspaceRevision } : {}) }, areas },
      dirtyComponentIds: [...dirty],
      saveState: action.type === 'update_component' ? 'saved_locally' : 'synchronised',
    };
  }
  return state;
}
