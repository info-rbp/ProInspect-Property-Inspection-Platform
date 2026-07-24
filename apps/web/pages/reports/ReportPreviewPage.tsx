import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileCheck2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { ReportAggregate } from '@pcr/domain';
import { useAuth } from '../../contexts/AuthContext';
import { getReportWorkspace } from '../../features/report-workspace/api/reportQueries';
import { runReportCommand } from '../../features/report-workspace/api/reportCommands';
import { ErrorState, LoadingState } from '../../components/layout/AsyncState';

const ReportPreviewPage: React.FC = () => {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const { userProfile } = useAuth();
  const [aggregate, setAggregate] = useState<ReportAggregate>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  useEffect(() => { if (!userProfile?.agencyId || !reportId) return; getReportWorkspace(userProfile.agencyId, reportId).then(setAggregate).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'The report preview could not be loaded.')); }, [reportId, userProfile?.agencyId]);
  if (error) return <ErrorState title="Report preview unavailable" message={error} action={<Link to="/app/admin/reports" className="rounded-lg bg-ink-950 px-4 py-2 text-sm font-bold text-white">Back to reports</Link>} />;
  if (!aggregate) return <LoadingState title="Loading canonical preview" message="Retrieving the current structured workspace." />;
  const report = aggregate.report;
  const generate = async () => {
    if (!userProfile?.agencyId) return;
    setBusy(true); setMessage(undefined);
    try { await runReportCommand(userProfile.agencyId, reportId, 'generate-issue-package', report.version ?? 1); setMessage('Immutable server package queued. Its PDF, canonical JSON and manifest will be written once and hash-verified.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Package generation could not be queued.'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-6xl space-y-5 pb-16">
    <header className="rounded-2xl bg-ink-950 p-6 text-white"><Link to={`/app/admin/reports/${reportId}`} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-400 hover:text-white"><ArrowLeft size={14} /> Report record</Link><div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-400">Canonical workspace preview · revision {report.workspaceRevision}</p><h1 className="mt-1 font-serif text-3xl font-bold">{report.propertyAddress}</h1><p className="mt-2 text-sm text-ink-400">{report.reportType} · {report.inspectionDate || 'Inspection date pending'}</p></div><button type="button" disabled={busy || !report.currentVersionId} onClick={() => void generate()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 text-sm font-black text-white hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <FileCheck2 size={17} />}Generate server package</button></div></header>
    {!report.currentVersionId ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Approval required.</strong> A PDF can be generated only from an immutable approved report version.</div> : null}
    {message ? <div role="status" className="rounded-xl border border-ink-300 bg-white p-4 text-sm text-ink-700">{message}</div> : null}
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p>This screen is a content preview, not a final document. Issued PDFs are rendered by the server from an immutable version and accompanied by a SHA-256 manifest.</p></div>
    {aggregate.areas.map((area) => <section key={area.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm"><div className="border-b border-ink-200 bg-ink-100 px-5 py-4"><h2 className="text-lg font-black text-ink-950">{area.name}</h2>{area.overallCommentary ? <p className="mt-1 text-sm leading-6 text-ink-600">{area.overallCommentary}</p> : null}</div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-ink-500"><tr><th className="px-5 py-3">Component</th><th className="px-3 py-3">Condition</th><th className="px-3 py-3">Cleanliness</th><th className="px-3 py-3">Operation</th><th className="px-5 py-3">Observed commentary</th></tr></thead><tbody className="divide-y divide-ink-100">{area.components.map((component) => <tr key={component.id}><td className="px-5 py-4 font-bold text-ink-950">{component.component}</td><td className="px-3 py-4 capitalize text-ink-700">{component.conditionCategory.replaceAll('_', ' ')}</td><td className="px-3 py-4 capitalize text-ink-700">{component.cleanlinessCategory.replaceAll('_', ' ')}</td><td className="px-3 py-4 capitalize text-ink-700">{component.workingStatus.replaceAll('_', ' ')}</td><td className="max-w-xl whitespace-pre-wrap px-5 py-4 leading-6 text-ink-700">{component.commentary || 'No commentary recorded.'}</td></tr>)}</tbody></table></div></section>)}
  </div>;
};
export default ReportPreviewPage;
