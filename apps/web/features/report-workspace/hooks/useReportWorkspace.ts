import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReportAggregate } from '@pcr/domain';
import { loadReportFromDB } from '../../../services/storageService';
import {
  createReportArea,
  createReportComponent,
  deleteReportArea,
  removeReportComponent,
  reorderReportAreas,
  reorderReportComponents,
  updateReportArea,
  updateReportComponent,
} from '../api/reportCommands';
import { getReportWorkspace } from '../api/reportQueries';
import { adaptLegacyReport } from '../model/legacyReportAdapter';
import { clearWorkspaceRecovery, loadWorkspaceRecovery, saveWorkspaceRecovery } from '../model/workspaceRecovery';
import { initialWorkspaceState } from '../model/workspaceTypes';
import { workspaceReducer } from '../model/workspaceReducer';

type WorkspaceArea = ReportAggregate['areas'][number];
type WorkspaceComponent = WorkspaceArea['components'][number];

const cloudWorkspaceEnabled = () => Boolean(import.meta.env.VITE_API_BASE_URL?.trim()) && localStorage.getItem('pcr_proinspect_logged_in') !== 'true';

function editablePatch(component: WorkspaceComponent): Partial<WorkspaceComponent> {
  const patch: Partial<WorkspaceComponent> = { ...component };
  delete patch.id;
  delete patch.version;
  delete patch.createdAt;
  delete patch.updatedAt;
  return patch;
}

function pendingComponent(name: string): WorkspaceComponent {
  return {
    id: crypto.randomUUID(),
    component: name.trim(),
    visibility: 'visible',
    testingMethod: 'not_tested',
    conditionCategory: 'unable_to_confirm',
    cleanlinessCategory: 'unable_to_confirm',
    workingStatus: 'untested',
    testStatus: 'untested',
    defects: [],
    maintenanceRequired: false,
    commentary: 'Assessment pending.',
    photoReferences: [],
    reviewStatus: 'draft',
    comparisonStatus: 'not_compared',
  };
}

export function useReportWorkspace(agencyId: string, reportId: string) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const cloudEnabled = cloudWorkspaceEnabled();

  const refresh = useCallback(async () => {
    if (!cloudWorkspaceEnabled()) return;
    const aggregate = await getReportWorkspace(agencyId, reportId);
    dispatch({ type: 'loaded', aggregate });
  }, [agencyId, reportId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const recovery = await loadWorkspaceRecovery(agencyId, reportId);
        if (cloudWorkspaceEnabled()) {
          try {
            const aggregate = await getReportWorkspace(agencyId, reportId);
            if (!cancelled) dispatch({ type: 'loaded', aggregate });
            return;
          } catch (error) {
            if (recovery && !cancelled) {
              dispatch({ type: 'loaded', aggregate: recovery.aggregate, migrationWarnings: ['Cloud workspace could not be reached. A recoverable local snapshot is open.'] });
              return;
            }
            if ((error as { status?: number }).status !== 404) throw error;
          }
        }
        if (recovery) {
          if (!cancelled) dispatch({ type: 'loaded', aggregate: recovery.aggregate, migrationWarnings: ['Recovered from this device. Synchronise before workflow submission.'] });
          return;
        }
        const legacy = await loadReportFromDB(reportId);
        if (!legacy) throw new Error('Report workspace was not found.');
        const migrated = adaptLegacyReport(legacy, agencyId);
        await saveWorkspaceRecovery(agencyId, migrated.aggregate);
        if (!cancelled) dispatch({ type: 'loaded', aggregate: migrated.aggregate, migrationWarnings: migrated.warnings });
      } catch (error) {
        if (!cancelled) dispatch({ type: 'failed', message: error instanceof Error ? error.message : 'The report workspace could not be loaded.' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [agencyId, reportId]);

  useEffect(() => {
    if (!state.aggregate) return;
    const timeout = window.setTimeout(() => { void saveWorkspaceRecovery(agencyId, state.aggregate!); }, 200);
    return () => window.clearTimeout(timeout);
  }, [agencyId, state.aggregate]);

  const saveComponent = useCallback(async (componentId: string) => {
    const current = stateRef.current;
    const aggregate = current.aggregate;
    if (!aggregate || !current.dirtyComponentIds.includes(componentId)) return;
    const area = aggregate.areas.find((candidate) => candidate.components.some((component) => component.id === componentId));
    const component = area?.components.find((candidate) => candidate.id === componentId);
    if (!area || !component) return;
    await saveWorkspaceRecovery(agencyId, aggregate);
    if (!cloudWorkspaceEnabled()) {
      dispatch({ type: 'save_state', saveState: 'saved_locally' });
      return;
    }
    dispatch({ type: 'save_state', saveState: 'synchronising' });
    try {
      const saved = await updateReportComponent(agencyId, reportId, area.id, component.id, editablePatch(component), component.version ?? 1);
      dispatch({ type: 'component_saved', areaId: area.id, component: saved, workspaceRevision: (aggregate.report.workspaceRevision ?? 1) + 1 });
      await clearWorkspaceRecovery(agencyId, reportId);
    } catch (error) {
      const candidate = error as { code?: string; status?: number };
      if (candidate.code === 'OFFLINE_QUEUED') dispatch({ type: 'save_state', saveState: 'saved_locally' });
      else if (candidate.status === 409) dispatch({ type: 'save_state', saveState: 'conflict' });
      else dispatch({ type: 'save_state', saveState: 'failed' });
    }
  }, [agencyId, reportId]);

  useEffect(() => {
    if (!state.dirtyComponentIds.length) return;
    const timeout = window.setTimeout(() => {
      for (const componentId of stateRef.current.dirtyComponentIds) void saveComponent(componentId);
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [saveComponent, state.dirtyComponentIds]);

  const requireCloud = useCallback(() => {
    if (!cloudWorkspaceEnabled()) throw new Error('Structural report changes require a connected cloud workspace.');
    const aggregate = stateRef.current.aggregate;
    if (!aggregate) throw new Error('Report workspace is unavailable.');
    return aggregate;
  }, []);

  const addArea = useCallback(async (name: string) => {
    const aggregate = requireCloud();
    await createReportArea(agencyId, reportId, { name: name.trim(), sequence: aggregate.areas.length + 1 });
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  const renameArea = useCallback(async (area: WorkspaceArea, name: string) => {
    requireCloud();
    await updateReportArea(agencyId, reportId, area.id, { name: name.trim() }, area.version ?? 1);
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  const removeArea = useCallback(async (area: WorkspaceArea) => {
    requireCloud();
    await deleteReportArea(agencyId, reportId, area.id, area.version ?? 1);
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  const moveArea = useCallback(async (areaId: string, offset: number) => {
    const aggregate = requireCloud();
    const ids = aggregate.areas.map((area) => area.id);
    const index = ids.indexOf(areaId); const target = index + offset;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderReportAreas(agencyId, reportId, ids);
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  const addComponent = useCallback(async (areaId: string, name: string) => {
    requireCloud();
    await createReportComponent(agencyId, reportId, areaId, pendingComponent(name));
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  const removeComponent = useCallback(async (areaId: string, componentId: string) => {
    const aggregate = requireCloud();
    await removeReportComponent(agencyId, reportId, areaId, componentId, aggregate.report.version ?? 1);
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  const moveComponent = useCallback(async (areaId: string, componentId: string, offset: number) => {
    const aggregate = requireCloud();
    const area = aggregate.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    const ids = area.components.map((component) => component.id);
    const index = ids.indexOf(componentId); const target = index + offset;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderReportComponents(agencyId, reportId, areaId, ids);
    await refresh();
  }, [agencyId, refresh, reportId, requireCloud]);

  return useMemo(() => ({
    state, dispatch, saveComponent, refresh, cloudEnabled,
    addArea, renameArea, removeArea, moveArea, addComponent, removeComponent, moveComponent,
  }), [addArea, addComponent, cloudEnabled, moveArea, moveComponent, refresh, removeArea, removeComponent, renameArea, saveComponent, state]);
}
