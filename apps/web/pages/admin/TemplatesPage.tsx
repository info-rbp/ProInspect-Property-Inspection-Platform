import React, { useEffect, useMemo, useState } from 'react';
import type { InspectionTypeTemplate, TemplateArea, TemplateComponent } from '@pcr/templates';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import { CheckCircle2, Copy, FileStack, LoaderCircle, LockKeyhole, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createTemplateDraft, listTemplateLibrary, runTemplateCommand, saveTemplateDraft } from '../../features/templates/api/templateClient';

const key = (template: Pick<InspectionTypeTemplate, 'id' | 'version'>) => `${template.id}@${template.version}`;
const field = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200';

function newArea(index: number): TemplateArea {
  return { id: `custom-area-${crypto.randomUUID()}`, name: `New area ${index}`, components: [] };
}

function newComponent(index: number): TemplateComponent {
  const id = `custom-component-${crypto.randomUUID()}`;
  return {
    id,
    name: `New component ${index}`,
    required: false,
    photoRequired: false,
    rule: {
      componentId: id,
      required: false,
      conditionRequired: true,
      cleanlinessRequired: true,
      workingStatusRequired: false,
      testMethodRequiredWhenConfirmed: false,
      minimumEvidence: [],
      maintenanceExtractionEnabled: true,
    },
  };
}

const TemplatesPage: React.FC = () => {
  const { userProfile } = useAuth();
  const agencyId = userProfile?.agencyId ?? 'unprovisioned-agency';
  const [templates, setTemplates] = useState<InspectionTypeTemplate[]>([...WA_RESIDENTIAL_V1_TEMPLATES]);
  const [selectedKey, setSelectedKey] = useState(key(WA_RESIDENTIAL_V1_TEMPLATES[0]));
  const [working, setWorking] = useState<InspectionTypeTemplate>(structuredClone(WA_RESIDENTIAL_V1_TEMPLATES[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const selected = templates.find((template) => key(template) === selectedKey) ?? templates[0];
  const editable = working.status === 'draft';

  const load = async () => {
    try {
      const next = await listTemplateLibrary(agencyId);
      setTemplates(next);
      const current = next.find((template) => key(template) === selectedKey) ?? next[0];
      if (current) { setSelectedKey(key(current)); setWorking(structuredClone(current)); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The template library could not be loaded.');
    }
  };
  useEffect(() => { void load(); }, [agencyId]);
  useEffect(() => { if (selected) setWorking(structuredClone(selected)); }, [selectedKey]);

  const execute = async (operation: () => Promise<InspectionTypeTemplate>, success: string) => {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const result = await operation();
      setMessage(success);
      await load();
      setSelectedKey(key(result));
      setWorking(structuredClone(result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The template operation failed.');
    } finally { setBusy(false); }
  };

  const patchArea = (areaIndex: number, patch: Partial<TemplateArea>) => setWorking((current) => ({
    ...current,
    areas: current.areas.map((area, index) => index === areaIndex ? { ...area, ...patch } : area),
  }));
  const patchComponent = (areaIndex: number, componentIndex: number, patch: Partial<TemplateComponent>) => setWorking((current) => ({
    ...current,
    areas: current.areas.map((area, index) => index !== areaIndex ? area : {
      ...area,
      components: area.components.map((component, childIndex) => childIndex === componentIndex ? {
        ...component,
        ...patch,
        rule: patch.rule ? { ...component.rule, ...patch.rule, componentId: component.id } as TemplateComponent['rule'] : component.rule,
      } : component),
    }),
  }));

  const componentCount = useMemo(() => working.areas.reduce((count, area) => count + area.components.length, 0), [working.areas]);

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <header className="overflow-hidden rounded-2xl bg-stone-950 p-6 text-white shadow-lg"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-400">Controlled configuration</p><div className="mt-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><h1 className="font-serif text-3xl font-bold">Inspection template library</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">Draft, validate and publish immutable agency template versions for Entry, Routine and Exit inspections.</p></div><button type="button" disabled={busy || !selected} onClick={() => selected && void execute(() => createTemplateDraft(agencyId, { sourceTemplateId: selected.id, sourceTemplateVersion: selected.version }), 'Draft version created.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-stone-950 disabled:opacity-40"><Copy size={16} /> Create draft from selected</button></div></header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}
    <div className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="space-y-2">{templates.map((template) => <button key={key(template)} type="button" onClick={() => setSelectedKey(key(template))} className={`w-full rounded-xl border p-4 text-left ${selectedKey === key(template) ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-stone-200 bg-white hover:border-stone-400'}`}><div className="flex justify-between gap-3"><span className="rounded-lg bg-stone-950 p-2 text-amber-400"><FileStack size={18} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${template.status === 'published' ? 'bg-emerald-100 text-emerald-800' : template.status === 'draft' ? 'bg-amber-100 text-amber-900' : 'bg-stone-200 text-stone-700'}`}>{template.status}</span></div><p className="mt-3 font-bold capitalize text-stone-950">{template.inspectionType} · {template.propertyType}</p><p className="mt-1 font-mono text-xs text-stone-500">{template.id} · v{template.version}</p></button>)}</aside>
      <main className="min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-stone-200 p-5 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${editable ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>{working.status}</span>{!editable ? <LockKeyhole size={15} className="text-stone-500" /> : null}</div><h2 className="mt-3 font-serif text-2xl font-bold text-stone-950">{working.id} · v{working.version}</h2><p className="mt-1 text-sm text-stone-500">{working.areas.length} areas · {componentCount} components · {working.jurisdiction ?? 'No jurisdiction'}</p></div><div className="flex flex-wrap gap-2">{editable ? <><button type="button" disabled={busy} onClick={() => void execute(() => saveTemplateDraft(agencyId, working), 'Draft saved.')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 px-3 text-sm font-bold"><Save size={15} /> Save draft</button><button type="button" disabled={busy} onClick={() => void execute(() => runTemplateCommand(agencyId, working, 'publish'), 'Template version published.')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-black text-white"><Send size={15} /> Publish</button></> : working.status === 'published' ? <button type="button" disabled={busy} onClick={() => void execute(() => runTemplateCommand(agencyId, working, 'retire'), 'Template version retired.')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-bold text-red-700"><Trash2 size={15} /> Retire</button> : null}{busy ? <LoaderCircle className="animate-spin text-amber-700" /> : null}</div></div>
        <div className="grid gap-4 border-b border-stone-200 p-5 md:grid-cols-4"><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Inspection type<select disabled={!editable} value={working.inspectionType} onChange={(event) => setWorking((current) => ({ ...current, inspectionType: event.target.value as InspectionTypeTemplate['inspectionType'] }))} className={`${field} mt-1 normal-case tracking-normal`}><option value="entry">Entry</option><option value="routine">Routine</option><option value="exit">Exit</option></select></label><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Property type<input disabled={!editable} value={working.propertyType} onChange={(event) => setWorking((current) => ({ ...current, propertyType: event.target.value }))} className={`${field} mt-1 normal-case tracking-normal`} /></label><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Jurisdiction<input disabled={!editable} value={working.jurisdiction ?? ''} onChange={(event) => setWorking((current) => ({ ...current, jurisdiction: event.target.value }))} className={`${field} mt-1 normal-case tracking-normal`} /></label><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Layout version<input disabled={!editable} value={working.outputLayoutVersion ?? ''} onChange={(event) => setWorking((current) => ({ ...current, outputLayoutVersion: event.target.value }))} className={`${field} mt-1 normal-case tracking-normal`} /></label></div>
        <div className="space-y-4 p-5">{working.areas.map((area, areaIndex) => <section key={area.id} className="rounded-xl border border-stone-200"><div className="flex items-center gap-3 border-b border-stone-200 bg-stone-50 p-4"><input disabled={!editable} value={area.name} onChange={(event) => patchArea(areaIndex, { name: event.target.value })} className={`${field} flex-1 font-bold`} aria-label={`Area ${areaIndex + 1} name`} />{editable ? <button type="button" disabled={working.areas.length <= 1} onClick={() => setWorking((current) => ({ ...current, areas: current.areas.filter((_, index) => index !== areaIndex) }))} className="grid h-10 w-10 place-items-center rounded-lg border border-red-200 text-red-700 disabled:opacity-30" aria-label={`Remove ${area.name}`}><Trash2 size={15} /></button> : null}</div><div className="divide-y divide-stone-100">{area.components.map((component, componentIndex) => <div key={component.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_120px_120px_150px_42px] lg:items-end"><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Component<input disabled={!editable} value={component.name} onChange={(event) => patchComponent(areaIndex, componentIndex, { name: event.target.value })} className={`${field} mt-1 normal-case tracking-normal`} /></label><label className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold"><input disabled={!editable} type="checkbox" checked={component.required} onChange={(event) => patchComponent(areaIndex, componentIndex, { required: event.target.checked, rule: { ...component.rule!, required: event.target.checked } })} /> Required</label><label className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold"><input disabled={!editable} type="checkbox" checked={component.photoRequired} onChange={(event) => patchComponent(areaIndex, componentIndex, { photoRequired: event.target.checked })} /> Photo</label><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Defect evidence<select disabled={!editable} value={component.rule?.minimumEvidence.find((item) => item.purpose === 'defect')?.minimum ?? 0} onChange={(event) => { const minimum = Number(event.target.value); const others = component.rule?.minimumEvidence.filter((item) => item.purpose !== 'defect') ?? []; patchComponent(areaIndex, componentIndex, { rule: { ...component.rule!, componentId: component.id, minimumEvidence: minimum ? [...others, { purpose: 'defect', minimum, waiverAllowed: true }] : others } }); }} className={`${field} mt-1 normal-case tracking-normal`}><option value={0}>None</option><option value={1}>1 image</option><option value={2}>2 images</option></select></label>{editable ? <button type="button" disabled={area.components.length <= 1} onClick={() => patchArea(areaIndex, { components: area.components.filter((_, index) => index !== componentIndex) })} className="grid h-10 w-10 place-items-center rounded-lg border border-red-200 text-red-700 disabled:opacity-30" aria-label={`Remove ${component.name}`}><Trash2 size={15} /></button> : <CheckCircle2 className="text-emerald-600" />}</div>)}{editable ? <button type="button" onClick={() => patchArea(areaIndex, { components: [...area.components, newComponent(area.components.length + 1)] })} className="m-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 px-3 text-sm font-bold"><Plus size={15} /> Add component</button> : null}</div></section>)}{editable ? <button type="button" onClick={() => setWorking((current) => ({ ...current, areas: [...current.areas, newArea(current.areas.length + 1)] }))} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-sm font-black text-white"><Plus size={16} /> Add area</button> : null}</div>
      </main>
    </div>
  </div>;
};

export default TemplatesPage;
