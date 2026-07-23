import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Cloud, CloudOff, RefreshCcw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { runQualityCheck } from '@pcr/quality';
import { useAuth } from '../../../contexts/AuthContext';
import { assessmentProgress, findArea, findComponent } from '../model/workspaceSelectors';
import { useAutosavePresentation } from '../hooks/useAutosave';
import { useReportWorkspace } from '../hooks/useReportWorkspace';
import { AreaNavigator } from './AreaNavigator';
import { AreaEditor } from './AreaEditor';
import { ComponentAssessmentForm } from './ComponentAssessmentForm';
import { CompletionSummary } from './CompletionSummary';
import { EvidenceLinker } from './EvidenceLinker';
import { ReviewDecisionPanel } from './ReviewDecisionPanel';
import { StructureEditor } from './StructureEditor';

export const ReportWorkspacePage: React.FC = () => {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const { userProfile } = useAuth();
  const agencyId = userProfile?.agencyId ?? 'unprovisioned-agency';
  const {
    state, dispatch, saveComponent, cloudEnabled,
    addArea, renameArea, removeArea, moveArea, addComponent, removeComponent, moveComponent,
  } = useReportWorkspace(agencyId, reportId);
  const save = useAutosavePresentation(state.saveState);
  const area = findArea(state.aggregate, state.selectedAreaId);
  const component = findComponent(state.aggregate, state.selectedAreaId, state.selectedComponentId);
  const progress = assessmentProgress(state.aggregate);
  const quality = useMemo(() => state.aggregate ? runQualityCheck({ aggregate: state.aggregate, stage: 'field_submission' }) : undefined, [state.aggregate]);
  const [structureBusy, setStructureBusy] = useState(false);
  const [structureError, setStructureError] = useState<string>();

  if (state.loading) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><RefreshCcw className="mx-auto animate-spin text-amber-600" /><p className="mt-3 text-sm font-semibold text-stone-600">Preparing report workspace…</p></div></div>;
  if (state.error || !state.aggregate || !quality) return <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><AlertTriangle className="mx-auto text-red-700" /><h1 className="mt-3 text-xl font-bold text-red-950">Workspace unavailable</h1><p className="mt-2 text-sm text-red-800">{state.error || 'The report could not be opened.'}</p><Link to="/app/admin/reports" className="mt-5 inline-flex rounded-lg bg-red-900 px-4 py-2 text-sm font-bold text-white">Back to reports</Link></div>;
  const aggregate = state.aggregate;
  const updateComponent = (patch: Parameters<typeof ComponentAssessmentForm>[0]['onChange'] extends (patch: infer P) => void ? P : never) => {
    if (!area || !component) return;
    dispatch({ type: 'update_component', areaId: area.id, componentId: component.id, patch });
  };
  const selectArea = (areaId: string) => { if (state.selectedComponentId) void saveComponent(state.selectedComponentId); dispatch({ type: 'select_area', areaId }); };
  const selectComponent = (componentId: string) => { if (state.selectedComponentId) void saveComponent(state.selectedComponentId); dispatch({ type: 'select_component', areaId: area!.id, componentId }); };
  const structural = async (operation: () => Promise<void>) => {
    setStructureBusy(true); setStructureError(undefined);
    try { await operation(); }
    catch (error) { setStructureError(error instanceof Error ? error.message : 'The report structure could not be changed.'); }
    finally { setStructureBusy(false); }
  };
  const evidenceContext = area && component && aggregate.report.propertyId && aggregate.report.inspectionJobId ? {
    propertyId: aggregate.report.propertyId,
    inspectionJobId: aggregate.report.inspectionJobId,
    reportId,
    areaId: area.id,
    componentIds: [component.id],
  } : undefined;

  return (
    <div className="mx-auto max-w-[1600px] pb-16 text-stone-900">
      <header className="relative overflow-hidden rounded-2xl bg-stone-950 px-5 py-6 text-white shadow-xl sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1/3 opacity-20" aria-hidden="true" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 16px, #f59e0b 16px 17px)' }} />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><Link to={`/app/admin/reports/${reportId}`} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-400 hover:text-white"><ArrowLeft size={14} /> Report record</Link><p className="mt-5 font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">{aggregate.report.inspectionType ?? 'inspection'} / revision {aggregate.report.workspaceRevision ?? 1}</p><h1 className="mt-1 max-w-4xl font-serif text-3xl font-bold leading-tight sm:text-4xl">{aggregate.report.propertyAddress}</h1><p className="mt-2 text-sm text-stone-400">{aggregate.report.reportType} · {aggregate.report.inspectionDate || 'Date pending'}</p></div><div className="flex flex-wrap items-center gap-2"><span role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${save.className}`}>{state.saveState === 'saved_locally' ? <CloudOff size={14} /> : <Cloud size={14} />}{save.label}</span><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold capitalize text-stone-300">{aggregate.report.lifecycleStatus.replaceAll('_', ' ')}</span></div></div>
      </header>
      {state.migrationWarnings.length ? <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="migration-warning"><h2 id="migration-warning" className="flex items-center gap-2 text-sm font-bold text-amber-950"><AlertTriangle size={17} /> Migration review required</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900">{state.migrationWarnings.slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}
      {structureError ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{structureError}</p> : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_390px]">
        <aside className="space-y-4 xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)] xl:overflow-auto">
          <div className="rounded-2xl border border-stone-200 bg-stone-100/70 p-3"><div className="px-2 pb-3"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">Inspection map</p><p className="mt-1 text-sm font-bold text-stone-900">{aggregate.areas.length} configured areas</p></div><AreaNavigator areas={aggregate.areas} selectedAreaId={state.selectedAreaId} onSelect={selectArea} /></div>
          <StructureEditor
            areas={aggregate.areas} selectedArea={area} selectedComponent={component} cloudEnabled={cloudEnabled} busy={structureBusy}
            onAddArea={(name) => structural(() => addArea(name))}
            onRenameArea={(candidate, name) => structural(() => renameArea(candidate, name))}
            onRemoveArea={(candidate) => structural(() => removeArea(candidate))}
            onMoveArea={(areaId, offset) => structural(() => moveArea(areaId, offset))}
            onAddComponent={(areaId, name) => structural(() => addComponent(areaId, name))}
            onRemoveComponent={(areaId, componentId) => structural(() => removeComponent(areaId, componentId))}
            onMoveComponent={(areaId, componentId, offset) => structural(() => moveComponent(areaId, componentId, offset))}
          />
        </aside>
        <main className="min-w-0 space-y-5"><AreaEditor area={area} selectedComponentId={state.selectedComponentId} onSelect={selectComponent} /><EvidenceLinker component={component} agencyId={agencyId} context={evidenceContext} onChange={(photoReferences) => updateComponent({ photoReferences })} /></main>
        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start"><ComponentAssessmentForm component={component} onChange={updateComponent} /><CompletionSummary quality={quality} progress={progress} /><ReviewDecisionPanel aggregate={aggregate} agencyId={agencyId} qualityReady={quality.status === 'ready'} onCompleted={() => window.location.reload()} /></div>
      </div>
    </div>
  );
};
