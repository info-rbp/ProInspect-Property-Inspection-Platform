import React from 'react';
import type { ReportAggregate } from '@pcr/domain';

type Component = ReportAggregate['areas'][number]['components'][number];

const fieldClass = 'mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-950 outline-none transition focus:border-accent-600 focus:ring-2 focus:ring-accent-200';
const labelClass = 'text-xs font-bold uppercase tracking-[0.12em] text-ink-500';

export const ComponentAssessmentForm: React.FC<{ component?: Component; onChange: (patch: Partial<Component>) => void }> = ({ component, onChange }) => {
  if (!component) return <aside className="rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-sm text-ink-500">Choose a component to record the assessment.</aside>;
  return (
    <aside className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm" aria-labelledby="component-heading">
      <div className="border-b border-ink-200 pb-4"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-700">Structured record</p><h2 id="component-heading" className="mt-1 font-serif text-2xl font-bold text-ink-950">{component.component}</h2></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Visibility<select className={fieldClass} value={component.visibility} onChange={(event) => onChange({ visibility: event.target.value as Component['visibility'] })}><option value="visible">Visible</option><option value="partially_visible">Partially visible</option><option value="not_visible">Not visible</option><option value="not_applicable">Not applicable</option></select></label>
        <label className={labelClass}>Condition<select className={fieldClass} value={component.conditionCategory} onChange={(event) => onChange({ conditionCategory: event.target.value as Component['conditionCategory'] })}><option value="intact">Intact</option><option value="minor_wear">Minor wear</option><option value="repair_required">Repair required</option><option value="replacement_recommended">Replacement recommended</option><option value="unable_to_confirm">Unable to confirm</option><option value="not_applicable">Not applicable</option></select></label>
        <label className={labelClass}>Cleanliness<select className={fieldClass} value={component.cleanlinessCategory} onChange={(event) => onChange({ cleanlinessCategory: event.target.value as Component['cleanlinessCategory'] })}><option value="clean">Clean</option><option value="requires_cleaning">Requires cleaning</option><option value="stained">Stained</option><option value="unable_to_confirm">Unable to confirm</option><option value="not_applicable">Not applicable</option></select></label>
        <label className={labelClass}>Working status<select className={fieldClass} value={component.workingStatus} onChange={(event) => onChange({ workingStatus: event.target.value as Component['workingStatus'] })}><option value="untested">Untested</option><option value="operation_confirmed">Operation confirmed</option><option value="appears_operational">Appears operational</option><option value="not_working">Not working</option><option value="unable_to_confirm">Unable to confirm</option><option value="not_applicable">Not applicable</option></select></label>
        <label className={labelClass}>Testing method<select className={fieldClass} value={component.testingMethod ?? 'not_tested'} onChange={(event) => onChange({ testingMethod: event.target.value as Component['testingMethod'], testStatus: event.target.value === 'not_tested' ? 'untested' : component.testStatus })}><option value="not_tested">Not tested</option><option value="manual_test">Manual test</option><option value="visual_evidence">Visual evidence</option><option value="advised">Advised</option></select></label>
        <label className={`${labelClass} flex items-center gap-3 self-end rounded-lg border border-ink-200 bg-white px-3 py-3`}><input type="checkbox" checked={component.maintenanceRequired} onChange={(event) => onChange({ maintenanceRequired: event.target.checked })} className="h-4 w-4 accent-accent-600" /> Maintenance candidate</label>
      </div>
      <label className={`${labelClass} mt-4 block`}>Inspector commentary<textarea className={`${fieldClass} min-h-32 resize-y leading-6`} value={component.commentary} onChange={(event) => onChange({ commentary: event.target.value })} placeholder="Record only what was observed, tested or advised." /></label>
      <label className={`${labelClass} mt-4 block`}>Defects (one per line)<textarea className={`${fieldClass} min-h-20 resize-y`} value={component.defects.join('\n')} onChange={(event) => onChange({ defects: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} /></label>
      <label className="mt-4 flex items-center gap-3 rounded-lg bg-red-50 px-3 py-3 text-sm font-semibold text-red-900"><input type="checkbox" checked={Boolean(component.safetyConcern)} onChange={(event) => onChange({ safetyConcern: event.target.checked })} className="h-4 w-4 accent-red-700" /> Apparent safety or security concern</label>
    </aside>
  );
};
