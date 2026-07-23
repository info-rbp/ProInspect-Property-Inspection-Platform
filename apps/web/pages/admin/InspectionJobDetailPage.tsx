import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, LoaderCircle, PauseCircle, PlayCircle, ShieldAlert, UserRoundCog, XCircle } from 'lucide-react';
import type { InspectionJob, InspectionJobStatus, PropertyRecord } from '../../types/platform';
import { getInspectionJob, runInspectionJobCommand, type InspectionJobCommand } from '../../services/platform/inspectionJobService';
import { getProperty } from '../../services/platform/propertyService';

const primary: Partial<Record<InspectionJobStatus, { command: InspectionJobCommand; label: string }>> = {
  booked: { command: 'assign', label: 'Confirm assignment' },
  assigned: { command: 'start-inspection', label: 'Start inspection' },
  inspection_started: { command: 'begin-photo-upload', label: 'Begin evidence upload' },
  photos_uploading: { command: 'complete-photo-upload', label: 'Complete evidence upload' },
  photos_uploaded: { command: 'submit-fieldwork', label: 'Submit fieldwork' },
};

const InspectionJobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<InspectionJob | null>(null);
  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [inspectorId, setInspectorId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [resumeStatus, setResumeStatus] = useState<InspectionJobStatus>('assigned');

  const loadJob = async () => {
    if (!jobId) return;
    const nextJob = await getInspectionJob(jobId);
    setJob(nextJob || null);
    if (nextJob) {
      setProperty(await getProperty(nextJob.propertyId) || null);
      setInspectorId(nextJob.assignedInspectorId ?? '');
      setReviewerId(nextJob.assignedReviewerId ?? '');
      setScheduledAt(nextJob.scheduledAt ? new Date(nextJob.scheduledAt).toISOString().slice(0, 16) : '');
    }
  };
  useEffect(() => { void loadJob(); }, [jobId]);

  const availablePrimary = job ? primary[job.status] : undefined;
  const terminal = job ? ['finalised', 'archived', 'cancelled'].includes(job.status) : false;
  const canInterrupt = job ? !terminal && !['draft', 'booked', 'on_hold'].includes(job.status) : false;
  const statusLabel = useMemo(() => job?.status.replaceAll('_', ' ') ?? '', [job?.status]);

  const command = async (name: InspectionJobCommand, body: Record<string, unknown> = {}) => {
    if (!jobId) return;
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const updated = await runInspectionJobCommand(jobId, name, body);
      setJob(updated);
      setMessage(`Command completed: ${name.replaceAll('-', ' ')}.`);
      await loadJob();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The job command could not be completed.');
    } finally { setBusy(false); }
  };

  if (!job) return <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-500">Inspection job not found.</div>;

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl bg-stone-950 p-6 text-white shadow-lg"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-400">Named workflow commands</p><div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-serif text-3xl font-bold">{property?.address || 'Inspection job'}</h1><p className="mt-2 text-sm text-stone-400">{job.reportType}</p></div><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold capitalize text-stone-300">{statusLabel}</span></div></header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {message ? <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={17} />{message}</p> : null}

    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><dl className="grid gap-4 md:grid-cols-2"><div><dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Scheduled</dt><dd className="mt-1 font-semibold">{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : 'Not scheduled'}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Inspector</dt><dd className="mt-1 font-semibold">{job.assignedInspectorId || 'Unassigned'}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Reviewer</dt><dd className="mt-1 font-semibold">{job.assignedReviewerId || 'Unassigned'}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Report</dt><dd className="mt-1 font-semibold">{job.reportId ? <Link className="text-amber-700 underline" to={`/app/admin/reports/${job.reportId}/edit`}>Open report workspace</Link> : 'No report linked'}</dd></div></dl>{job.notes ? <p className="mt-4 border-t border-stone-100 pt-4 text-sm text-stone-600">{job.notes}</p> : null}</section>

    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><PlayCircle className="text-emerald-700" /><h2 className="font-bold text-stone-950">Workflow action</h2></div><p className="mt-1 text-sm text-stone-500">Only commands valid for the current job status are accepted by the server.</p><div className="mt-4 flex flex-wrap gap-2">{availablePrimary ? <button type="button" disabled={busy} onClick={() => void command(availablePrimary.command, availablePrimary.command === 'assign' ? { assignedInspectorId: inspectorId || job.assignedInspectorId } : {})} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-40">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <PlayCircle size={16} />}{availablePrimary.label}</button> : null}{job.status === 'on_hold' ? <><select value={resumeStatus} onChange={(event) => setResumeStatus(event.target.value as InspectionJobStatus)} className="rounded-lg border border-stone-300 px-3 text-sm"><option value="assigned">Assigned</option><option value="inspection_started">Inspection started</option><option value="photos_uploading">Photos uploading</option><option value="photos_uploaded">Photos uploaded</option><option value="inspection_submitted">Fieldwork submitted</option></select><button type="button" disabled={busy} onClick={() => void command('resume', { resumeStatus })} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white"><PlayCircle size={16} /> Resume</button></> : null}</div></section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><div className="flex items-center gap-2"><UserRoundCog className="text-amber-700" /><h2 className="font-bold text-stone-950">Assignments</h2></div><div className="mt-4 grid gap-3"><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Inspector ID<input value={inspectorId} onChange={(event) => setInspectorId(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label><label className="text-xs font-bold uppercase tracking-wider text-stone-500">Reviewer ID<input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label><button type="button" disabled={busy || (!inspectorId.trim() && !reviewerId.trim())} onClick={() => void command('reassign', { ...(inspectorId.trim() ? { assignedInspectorId: inspectorId.trim() } : {}), ...(reviewerId.trim() ? { assignedReviewerId: reviewerId.trim() } : {}), reason: 'Assignment updated from job workspace.' })} className="min-h-10 rounded-lg border border-stone-950 text-sm font-bold">Update assignments</button></div></section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><div className="flex items-center gap-2"><CalendarClock className="text-amber-700" /><h2 className="font-bold text-stone-950">Schedule</h2></div><label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">Date and time<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label><button type="button" disabled={busy || !scheduledAt} onClick={() => void command('reschedule', { scheduledAt: new Date(scheduledAt).toISOString(), reason: 'Schedule updated from job workspace.' })} className="mt-3 min-h-10 w-full rounded-lg border border-stone-950 text-sm font-bold">Reschedule</button></section>
    </div>

    {!terminal ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex items-center gap-2"><ShieldAlert className="text-red-700" /><h2 className="font-bold text-red-950">Exceptions and interruption</h2></div><div className="mt-4 flex flex-wrap gap-2">{canInterrupt ? <><button type="button" disabled={busy} onClick={() => void command('hold', { reason: 'Placed on hold from job workspace.' })} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 text-sm font-bold text-amber-900"><PauseCircle size={15} /> Hold</button><button type="button" disabled={busy} onClick={() => void command('record-no-access')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-bold text-red-800"><AlertTriangle size={15} /> No access</button><button type="button" disabled={busy} onClick={() => void command('record-unsafe')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-bold text-red-800"><ShieldAlert size={15} /> Unsafe</button></> : null}<button type="button" disabled={busy} onClick={() => { if (window.confirm('Cancel this inspection job?')) void command('cancel', { reason: 'Cancelled from job workspace.' }); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-800 px-3 text-sm font-black text-white"><XCircle size={15} /> Cancel</button></div></section> : null}
  </div>;
};

export default InspectionJobDetailPage;
