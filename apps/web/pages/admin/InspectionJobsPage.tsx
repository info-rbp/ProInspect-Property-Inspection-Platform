import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ClipboardPlus, KeyRound, ShieldAlert } from 'lucide-react';
import type { InspectionTypeTemplate } from '@pcr/templates';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import type { InspectionJob, PropertyRecord, ReportIndex, Tenancy, UserProfile } from '../../types/platform';
import { useAuth } from '../../contexts/AuthContext';
import { listTemplateLibrary } from '../../features/templates/api/templateClient';
import { bookInspectionJob, listInspectionJobs } from '../../services/platform/inspectionJobService';
import { listProperties } from '../../services/platform/propertyService';
import { listReportIndexes } from '../../services/platform/reportIndexService';
import { listTenancies } from '../../services/platform/tenancyService';
import { DEFAULT_AGENCY_ID, listUserProfiles } from '../../services/platform/userProfileService';
import { useDirtyForm } from '../../hooks/useDirtyForm';

type InspectionType = 'entry' | 'routine' | 'exit';

const fieldClass = 'w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent-200';
const labelClass = 'grid gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-ink-600';
const templateKey = (template: Pick<InspectionTypeTemplate, 'id' | 'version'>) => `${template.id}@${template.version}`;

const InspectionJobsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const agencyId = userProfile?.agencyId ?? DEFAULT_AGENCY_ID;
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<ReportIndex[]>([]);
  const [templates, setTemplates] = useState<InspectionTypeTemplate[]>([...WA_RESIDENTIAL_V1_TEMPLATES]);
  const [isCreating, setIsCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<{ jobId: string; reportId: string }>();
  const [form, setForm] = useState({
    propertyId: '', tenancyId: '', inspectionType: 'entry' as InspectionType, scheduledAt: '', templateKey: '',
    assignedInspectorId: '', assignedReviewerId: '', sourceReportId: '', baselineVersionId: '',
    accessMethod: 'agency_key', accessInstructions: '',
  });
  const dirtyForm = useDirtyForm({ scopeId: 'job:new', entityType: 'job' });

  const loadData = async () => {
    const [nextJobs, nextProperties, nextTenancies, nextUsers, nextReports, nextTemplates] = await Promise.all([
      listInspectionJobs(), listProperties(), listTenancies(), listUserProfiles(), listReportIndexes(),
      listTemplateLibrary(agencyId).catch(() => [...WA_RESIDENTIAL_V1_TEMPLATES]),
    ]);
    const published = nextTemplates.filter((template) => template.status === 'published' && ['entry', 'routine', 'exit'].includes(template.inspectionType));
    setJobs(nextJobs);
    setProperties(nextProperties);
    setTenancies(nextTenancies);
    setUsers(nextUsers);
    setReports(nextReports);
    setTemplates(published.length ? published : [...WA_RESIDENTIAL_V1_TEMPLATES]);
    setForm((current) => {
      const compatible = (published.length ? published : WA_RESIDENTIAL_V1_TEMPLATES).filter((template) => template.inspectionType === current.inspectionType);
      const selectedIsValid = compatible.some((template) => templateKey(template) === current.templateKey);
      return {
        ...current,
        propertyId: current.propertyId || nextProperties[0]?.id || '',
        templateKey: selectedIsValid ? current.templateKey : compatible.at(-1) ? templateKey(compatible.at(-1)!) : '',
      };
    });
  };

  useEffect(() => { void loadData(); }, [agencyId]);

  const compatibleTemplates = templates.filter((candidate) => candidate.inspectionType === form.inspectionType && candidate.status === 'published');
  const template = compatibleTemplates.find((candidate) => templateKey(candidate) === form.templateKey) ?? compatibleTemplates.at(-1);
  const propertyTenancies = tenancies.filter((tenancy) => tenancy.propertyId === form.propertyId && tenancy.status === 'active');
  const inspectors = users.filter((user) => user.role === 'inspector' && user.status === 'active');
  const reviewers = users.filter((user) => user.role === 'reviewer' && user.status === 'active');
  const entryBaselines = reports.filter((report) => report.propertyId === form.propertyId && report.reportType === 'Property Condition Report' && ['finalised', 'archived'].includes(report.lifecycleStatus));
  const conflict = useMemo(() => jobs.find((job) => job.propertyId === form.propertyId && job.scheduledAt === (form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined) && !['finalised', 'archived', 'cancelled'].includes(job.status)), [form.propertyId, form.scheduledAt, jobs]);
  const exitIncomplete = form.inspectionType === 'exit' && (!form.sourceReportId || !form.baselineVersionId);
  const bookingReady = Boolean(form.propertyId && form.scheduledAt && template && !conflict && !exitIncomplete);

  const changeInspectionType = (inspectionType: InspectionType) => {
    const compatible = templates.filter((candidate) => candidate.inspectionType === inspectionType && candidate.status === 'published');
    setForm((current) => ({
      ...current,
      inspectionType,
      templateKey: compatible.at(-1) ? templateKey(compatible.at(-1)!) : '',
      sourceReportId: '',
      baselineVersionId: '',
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bookingReady || !template) return;
    setSubmitting(true);
    try {
      const result = await bookInspectionJob({
        agencyId, propertyId: form.propertyId, ...(form.tenancyId ? { tenancyId: form.tenancyId } : {}),
        inspectionType: form.inspectionType, scheduledAt: new Date(form.scheduledAt).toISOString(),
        templateId: template.id, templateVersion: template.version,
        sourceReportIds: form.sourceReportId ? [form.sourceReportId] : [],
        ...(form.baselineVersionId ? { baselineVersionIds: [form.baselineVersionId] } : {}),
        ...(form.assignedInspectorId ? { assignedInspectorId: form.assignedInspectorId } : {}),
        ...(form.assignedReviewerId ? { assignedReviewerId: form.assignedReviewerId } : {}),
        accessInstructions: { method: form.accessMethod, instructions: form.accessInstructions },
      });
      dirtyForm.markClean();
      setBookingResult(result);
      setIsCreating(false);
      await loadData();
    } finally { setSubmitting(false); }
  };

  const propertyName = (propertyId: string) => properties.find((property) => property.id === propertyId)?.address || propertyId;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-ink-950 p-6 text-white shadow-lg">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-400">Controlled field operations</p>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><h1 className="font-serif text-3xl font-bold">Inspection bookings</h1><p className="mt-2 text-sm text-ink-400">One command creates the job, report workspace and immutable template assignment.</p></div>
          <button type="button" onClick={() => { setBookingResult(undefined); setIsCreating(true); }} className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-black text-white hover:bg-accent-400"><ClipboardPlus size={17} /> Book inspection</button>
        </div>
      </header>

      {bookingResult ? <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={19} /><div><strong>Booking materialised.</strong><span className="ml-2 font-mono text-xs">Job {bookingResult.jobId} · Report {bookingResult.reportId}</span></div></div> : null}

      {isCreating ? (
        <form {...dirtyForm.formProps} onSubmit={handleSubmit} className="rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="border-b border-ink-200 p-5"><h2 className="font-serif text-xl font-bold text-ink-950">Booking command</h2><p className="mt-1 text-sm text-ink-500">Template and assignment checks run before any workspace is created.</p></div>
          <div className="grid gap-5 p-5 lg:grid-cols-3">
            <label className={labelClass}>Property<select className={fieldClass} required value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value, tenancyId: '', sourceReportId: '' }))}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}</select></label>
            <label className={labelClass}>Tenancy<select className={fieldClass} value={form.tenancyId} onChange={(event) => setForm((current) => ({ ...current, tenancyId: event.target.value }))}><option value="">No active tenancy</option>{propertyTenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.id}>{tenancy.tenantNames.join(', ') || tenancy.id}</option>)}</select></label>
            <label className={labelClass}>Inspection type<select className={fieldClass} value={form.inspectionType} onChange={(event) => changeInspectionType(event.target.value as InspectionType)}><option value="entry">Entry PCR</option><option value="routine">Routine inspection</option><option value="exit">Exit inspection</option></select></label>
            <label className={labelClass}>Published template<select className={fieldClass} required value={form.templateKey} onChange={(event) => setForm((current) => ({ ...current, templateKey: event.target.value }))}>{compatibleTemplates.length ? compatibleTemplates.map((candidate) => <option key={templateKey(candidate)} value={templateKey(candidate)}>{candidate.id} · v{candidate.version}{candidate.jurisdiction ? ` · ${candidate.jurisdiction}` : ''}</option>) : <option value="">No compatible published template</option>}</select></label>
            <label className={labelClass}>Scheduled time<input className={fieldClass} required type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label>
            <label className={labelClass}>Inspector<select className={fieldClass} value={form.assignedInspectorId} onChange={(event) => setForm((current) => ({ ...current, assignedInspectorId: event.target.value }))}><option value="">Leave unassigned</option>{inspectors.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}</select></label>
            <label className={labelClass}>Independent reviewer<select className={fieldClass} value={form.assignedReviewerId} onChange={(event) => setForm((current) => ({ ...current, assignedReviewerId: event.target.value }))}><option value="">Assign later</option>{reviewers.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}</select></label>
            {template ? <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 lg:col-span-3"><p className="text-xs font-bold uppercase tracking-wider text-ink-500">Immutable template assignment</p><p className="mt-2 font-bold capitalize text-ink-950">{template.inspectionType} · {template.propertyType} · v{template.version}</p><p className="mt-1 truncate font-mono text-[10px] text-ink-600">{template.contentHash}</p></div> : null}
            {form.inspectionType === 'exit' ? <><label className={labelClass}>Approved Entry report<select className={fieldClass} required value={form.sourceReportId} onChange={(event) => setForm((current) => ({ ...current, sourceReportId: event.target.value }))}><option value="">Select immutable source</option>{entryBaselines.map((report) => <option key={report.id} value={report.reportId}>{report.propertyAddress || report.reportId}</option>)}</select></label><label className={labelClass}>Entry version ID<input className={fieldClass} required value={form.baselineVersionId} onChange={(event) => setForm((current) => ({ ...current, baselineVersionId: event.target.value }))} placeholder="Immutable version identifier" /></label></> : null}
            <label className={labelClass}>Access method<select className={fieldClass} value={form.accessMethod} onChange={(event) => setForm((current) => ({ ...current, accessMethod: event.target.value }))}><option value="agency_key">Agency key</option><option value="lockbox">Lockbox</option><option value="tenant_present">Tenant present</option><option value="vacant_unlocked">Vacant / unlocked</option><option value="other">Other</option></select></label>
            <label className={`${labelClass} lg:col-span-2`}>Restricted access instructions<input className={fieldClass} value={form.accessInstructions} onChange={(event) => setForm((current) => ({ ...current, accessInstructions: event.target.value }))} placeholder="Visible only to assigned staff" /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 bg-ink-50 p-4">
            <div className="text-xs">{conflict ? <span className="inline-flex items-center gap-2 font-bold text-red-700"><ShieldAlert size={15} /> Conflicting active booking at this time</span> : !template ? <span className="font-semibold text-red-700">A compatible published template is required.</span> : exitIncomplete ? <span className="font-semibold text-amber-800">Exit requires an approved Entry report and exact version.</span> : <span className="inline-flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={15} /> Booking checks ready</span>}</div>
            <div className="flex gap-2"><button type="button" onClick={() => { dirtyForm.markClean(); setIsCreating(false); }} className="rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-bold text-ink-700">Cancel</button><button type="submit" disabled={!bookingReady || submitting} className="inline-flex items-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40"><CalendarClock size={16} /> {submitting ? 'Booking…' : 'Create booking'}</button></div>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
        {jobs.length === 0 ? <div className="p-8 text-center text-sm text-ink-500">No inspection jobs yet.</div> : <table className="w-full text-left text-sm"><thead className="bg-ink-100 text-xs uppercase tracking-wider text-ink-500"><tr><th className="p-3">Property</th><th className="p-3">Report type</th><th className="p-3">Status</th><th className="p-3">Inspector</th><th className="p-3">Reviewer</th></tr></thead><tbody className="divide-y divide-ink-100">{jobs.map((job) => <tr key={job.id} className="hover:bg-ink-50"><td className="p-3 font-bold text-ink-950"><Link to={`/app/admin/jobs/${job.id}`}>{propertyName(job.propertyId)}</Link></td><td className="p-3 text-ink-600">{job.reportType}</td><td className="p-3"><span className="rounded-full bg-ink-100 px-2 py-1 text-xs font-bold text-ink-700">{job.status.replaceAll('_', ' ')}</span></td><td className="p-3 text-ink-600">{job.assignedInspectorId || 'Unassigned'}</td><td className="p-3 text-ink-600">{job.assignedReviewerId || 'Unassigned'}</td></tr>)}</tbody></table>}
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><KeyRound className="mt-0.5 shrink-0" size={16} /><p>Access instructions are treated as restricted operational data. They are excluded from queue summaries, analytics and notification payloads.</p></div>
    </div>
  );
};

export default InspectionJobsPage;
