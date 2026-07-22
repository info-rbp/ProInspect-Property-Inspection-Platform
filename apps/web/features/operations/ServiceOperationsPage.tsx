import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, Boxes, ChevronRight, ClipboardCheck, CloudCog, FileInput, KeyRound, LoaderCircle, RefreshCw, Send, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/apiClient';

type RecordData = { id: string; version: number; status?: string; propertyId?: string; reportId?: string; serviceType?: string; priority?: string; dueAt?: string; updatedAt?: string; [key: string]: unknown };
type Phase = 'Commercial' | 'Operations' | 'Scale';
type Resource = { key: string; label: string; description: string; phase: Phase; icon: React.ComponentType<{ size?: number }>; commands?: Record<string, { label: string; action: string }> };

const resources: Resource[] = [
  { key: 'import-jobs', label: 'Previous report imports', description: 'Human-confirmed extraction and mapping.', phase: 'Commercial', icon: FileInput, commands: { queued: { label: 'Extract', action: 'extract' }, review_required: { label: 'Confirm', action: 'confirm' }, failed: { label: 'Retry', action: 'retry' } } },
  { key: 'evidence-index', label: 'Evidence vault', description: 'Immutable evidence inventory and retention state.', phase: 'Commercial', icon: Archive },
  { key: 'deliveries', label: 'Secure delivery', description: 'Expiring, audited owner and tenant packages.', phase: 'Commercial', icon: Send, commands: { draft: { label: 'Queue', action: 'queue' }, failed: { label: 'Retry', action: 'retry' }, sent: { label: 'Revoke', action: 'revoke' } } },
  { key: 'maintenance-items', label: 'Maintenance triage', description: 'Evidence-linked actions and visible completion.', phase: 'Operations', icon: Wrench, commands: { candidate: { label: 'Approve', action: 'approve' }, approved: { label: 'Assign', action: 'assign' }, assigned: { label: 'Start', action: 'start' }, in_progress: { label: 'Complete', action: 'complete' }, completed: { label: 'Verify', action: 'verify' }, verified: { label: 'Close', action: 'close' } } },
  { key: 'comparison-runs', label: 'Entry / Exit comparison', description: 'Deterministic pairing with reviewer outcomes.', phase: 'Operations', icon: ClipboardCheck, commands: { queued: { label: 'Start matching', action: 'start' }, suggestions_ready: { label: 'Begin review', action: 'review' }, review_in_progress: { label: 'Approve', action: 'approve' }, failed: { label: 'Retry', action: 'retry' } } },
  { key: 'tenant-invitations', label: 'Tenant review', description: 'Restricted invitations and immutable submissions.', phase: 'Operations', icon: ShieldCheck },
  { key: 'keys', label: 'Access and keys', description: 'Restricted custody and movement history.', phase: 'Operations', icon: KeyRound },
  { key: 'offline-packages', label: 'Offline packages', description: 'Revocable inspection assignments and sync state.', phase: 'Operations', icon: Boxes },
  { key: 'service-orders', label: 'Managed services', description: 'SLA-controlled production and field operations.', phase: 'Scale', icon: CloudCog, commands: { requested: { label: 'Triage', action: 'triage' }, triaged: { label: 'Assign', action: 'assign' }, assigned: { label: 'Start', action: 'start' }, in_progress: { label: 'Submit QA', action: 'submit-quality' }, quality_review: { label: 'Complete', action: 'complete' }, failed: { label: 'Retry', action: 'retry' } } },
  { key: 'field-attendances', label: 'Field attendance', description: 'Attendance windows, outcomes, and safety stops.', phase: 'Scale', icon: ClipboardCheck, commands: { scheduled: { label: 'Travel', action: 'travel' }, travelling: { label: 'Arrive', action: 'arrive' }, arrived: { label: 'Complete', action: 'complete' } } },
  { key: 'integration-connections', label: 'PMS integrations', description: 'Secret-referenced connections and reconciliation.', phase: 'Scale', icon: CloudCog },
  { key: 'portfolio-audits', label: 'Portfolio audits', description: 'Operational exceptions requiring agency review.', phase: 'Scale', icon: AlertTriangle, commands: { queued: { label: 'Start audit', action: 'start' }, review_required: { label: 'Approve', action: 'approve' }, approved: { label: 'Issue', action: 'issue' }, failed: { label: 'Retry', action: 'retry' } } },
  { key: 'evidence-packs', label: 'Evidence packs', description: 'Approved minimum-necessary exports with manifests.', phase: 'Scale', icon: Archive, commands: { requested: { label: 'Approve', action: 'approve' }, approved: { label: 'Generate', action: 'generate' }, ready: { label: 'Revoke', action: 'revoke' }, failed: { label: 'Retry', action: 'retry' } } },
];

const phases: Phase[] = ['Commercial', 'Operations', 'Scale'];

export const ServiceOperationsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>('Operations');
  const phaseResources = useMemo(() => resources.filter((resource) => resource.phase === phase), [phase]);
  const [selectedKey, setSelectedKey] = useState('maintenance-items');
  const selected = resources.find((resource) => resource.key === selectedKey) ?? phaseResources[0]!;
  const [records, setRecords] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const configured = Boolean(import.meta.env.VITE_API_BASE_URL?.trim());

  useEffect(() => { if (!phaseResources.some((resource) => resource.key === selectedKey)) setSelectedKey(phaseResources[0]!.key); }, [phaseResources, selectedKey]);
  const load = useCallback(async () => {
    if (!configured) { setRecords([]); setError(undefined); return; }
    setLoading(true); setError(undefined);
    try { setRecords(await apiRequest<RecordData[]>(userProfile?.agencyId, `/api/v1/${selected.key}?limit=100`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load this operational queue.'); }
    finally { setLoading(false); }
  }, [configured, selected.key, userProfile?.agencyId]);
  useEffect(() => { void load(); }, [load]);

  const runCommand = async (record: RecordData, action: string) => {
    const evidenceRequired = selected.key === 'maintenance-items' && ['complete', 'verify', 'close'].includes(action);
    const outcomeRequired = selected.key === 'field-attendances' && ['complete', 'no-access', 'unsafe'].includes(action);
    const value = evidenceRequired ? window.prompt('Enter one or more evidence IDs, separated by commas:') : outcomeRequired ? window.prompt('Enter the attendance outcome code:') : undefined;
    if ((evidenceRequired || outcomeRequired) && !value?.trim()) return;
    setLoading(true); setError(undefined);
    try {
      await apiRequest(userProfile?.agencyId, `/api/v1/${selected.key}/${record.id}/commands/${action}`, {
        method: 'POST', body: { expectedVersion: record.version, ...(evidenceRequired ? { evidenceIds: value!.split(',').map((item) => item.trim()).filter(Boolean) } : {}), ...(outcomeRequired ? { outcomeCode: value } : {}), ...(action === 'confirm' ? { acceptedCandidateCount: 1 } : {}) },
        entityType: selected.key, entityId: record.id, action,
      });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The command could not be completed.'); setLoading(false); }
  };

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <header className="overflow-hidden rounded-2xl border border-stone-300 bg-stone-950 text-white shadow-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Controlled service delivery</p><h1 className="mt-2 text-3xl font-black tracking-tight">Service operations</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">Commercial workflows, field operations, and managed services remain tied to authorised instructions, immutable evidence, and named lifecycle commands.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-stone-950 hover:bg-amber-300 disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} />Refresh queue</button>
      </div>
    </header>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Delivery phase">
      {phases.map((item) => <button key={item} type="button" role="tab" aria-selected={phase === item} onClick={() => setPhase(item)} className={`min-h-11 rounded-full border px-5 text-sm font-bold ${phase === item ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'}`}>{item}</button>)}
    </div>
    <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
      <nav className="space-y-2" aria-label={`${phase} modules`}>{phaseResources.map((resource) => { const Icon = resource.icon; return <button key={resource.key} type="button" onClick={() => setSelectedKey(resource.key)} className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${selected.key === resource.key ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-stone-200 bg-white hover:border-stone-400'}`}><span className="mt-0.5 rounded-lg bg-stone-950 p-2 text-amber-400"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block font-bold text-stone-950">{resource.label}</span><span className="mt-1 block text-xs leading-5 text-stone-600">{resource.description}</span></span><ChevronRight size={17} className="mt-2 text-stone-400" /></button>; })}</nav>
      <section className="min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm" aria-labelledby="queue-heading">
        <div className="border-b border-stone-200 p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{selected.phase}</p><h2 id="queue-heading" className="mt-1 text-xl font-black text-stone-950">{selected.label}</h2><p className="mt-1 text-sm text-stone-600">{selected.description}</p></div>
        {!configured ? <div className="m-5 rounded-xl border border-amber-300 bg-amber-50 p-5"><h3 className="font-bold text-stone-950">Cloud API connection required</h3><p className="mt-1 text-sm leading-6 text-stone-700">Set <code>VITE_API_BASE_URL</code> for this environment. The module stays disabled locally so sensitive operational records are never fabricated or written directly from the browser.</p></div> : null}
        {error ? <div role="alert" className="m-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div> : null}
        {loading ? <div className="grid min-h-40 place-items-center text-stone-600"><LoaderCircle className="animate-spin" aria-label="Loading" /></div> : configured && !records.length ? <div className="p-10 text-center"><Boxes className="mx-auto text-stone-400" /><p className="mt-3 font-bold text-stone-900">No records in this queue</p><p className="mt-1 text-sm text-stone-500">Records appear here after an authorised upstream workflow creates them.</p></div> : null}
        {!loading && records.length ? <div className="divide-y divide-stone-200">{records.map((record) => { const next = record.status ? selected.commands?.[record.status] : undefined; return <article key={record.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-stone-950">{String(record.serviceType ?? record.propertyId ?? record.reportId ?? record.id)}</h3><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700">{String(record.status ?? 'active').replace(/_/gu, ' ')}</span></div><p className="mt-1 truncate font-mono text-xs text-stone-500">{record.id} · version {record.version}</p>{record.dueAt ? <p className="mt-2 text-xs font-medium text-stone-600">Due {new Date(record.dueAt).toLocaleString()}</p> : null}</div>{next ? <button type="button" disabled={loading} onClick={() => void runCommand(record, next.action)} className="min-h-11 rounded-lg border border-stone-950 px-4 text-sm font-bold text-stone-950 hover:bg-stone-950 hover:text-white disabled:opacity-50">{next.label}</button> : <span className="text-xs font-semibold text-stone-500">No action available</span>}</article>; })}</div> : null}
      </section>
    </div>
  </div>;
};
