import React, { useEffect, useState } from 'react';
import { Copy, LoaderCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReportIndex } from '../../types/platform';
import { useAuth } from '../../contexts/AuthContext';
import { cloneReport } from '../../features/report-workspace/api/reportCommands';
import { getReportIndex } from '../../services/platform/reportIndexService';

const ReportDetailPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [reportIndex, setReportIndex] = useState<ReportIndex | null>(null);
  const [showClone, setShowClone] = useState(false);
  const [carryCommentary, setCarryCommentary] = useState(false);
  const [carryMaintenance, setCarryMaintenance] = useState(true);
  const [inspectionDate, setInspectionDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!reportId) return;
    getReportIndex(reportId).then((report) => setReportIndex(report || null));
  }, [reportId]);

  const clone = async () => {
    if (!reportId || !userProfile?.agencyId) return;
    setBusy(true); setError(undefined);
    try {
      const result = await cloneReport(userProfile.agencyId, reportId, {
        ...(inspectionDate ? { inspectionDate } : {}),
        carryCommentary,
        carryMaintenance,
      });
      navigate(`/app/admin/reports/${result.reportId}/edit`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be cloned.');
    } finally { setBusy(false); }
  };

  if (!reportIndex) return <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-500">Report index not found.</div>;

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl bg-stone-950 p-6 text-white shadow-lg"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-400">Report record</p><h1 className="mt-2 font-serif text-3xl font-bold">{reportIndex.propertyAddress || 'Untitled report'}</h1><p className="mt-2 text-sm text-stone-400">{reportIndex.reportType} · {reportIndex.lifecycleStatus.replaceAll('_', ' ')}</p></header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Link to={`/app/admin/reports/${reportIndex.reportId}/edit`} className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Edit report</Link><Link to={`/app/admin/reports/${reportIndex.reportId}/preview`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700">Preview report</Link><Link to={`/app/admin/reports/${reportIndex.reportId}/review`} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">Review workspace</Link><button type="button" onClick={() => setShowClone((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"><Copy size={15} /> Clone report</button></div>
    {showClone ? <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-xl font-bold text-stone-950">Create a controlled draft clone</h2><p className="mt-1 text-sm leading-6 text-stone-500">The clone receives new report, area and component identifiers. Existing photos, approvals and final assets are never copied as current evidence.</p><div className="mt-4 grid gap-4 md:grid-cols-3"><label className="text-xs font-bold uppercase tracking-wider text-stone-500">New inspection date<input type="date" value={inspectionDate} onChange={(event) => setInspectionDate(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label><label className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-semibold text-stone-700"><input type="checkbox" checked={carryCommentary} onChange={(event) => setCarryCommentary(event.target.checked)} /> Carry previous commentary as draft text</label><label className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-semibold text-stone-700"><input type="checkbox" checked={carryMaintenance} onChange={(event) => setCarryMaintenance(event.target.checked)} /> Carry unresolved maintenance flags</label></div><div className="mt-4 flex justify-end"><button type="button" disabled={busy || !userProfile?.agencyId} onClick={() => void clone()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-stone-950 disabled:opacity-40">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Copy size={16} />} Create draft clone</button></div></section> : null}
  </div>;
};

export default ReportDetailPage;
