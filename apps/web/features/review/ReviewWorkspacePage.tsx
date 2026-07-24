import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ReportAggregate, ReportReviewComment, ReportReviewRound } from '@pcr/domain';
import { AlertTriangle, ArrowLeft, CheckCircle2, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getReportWorkspace } from '../report-workspace/api/reportQueries';
import { runReportCommand, runReportQuality } from '../report-workspace/api/reportCommands';
import { addReviewComment, createReviewRound, listReviewComments, listReviewRounds, resolveReviewComment } from './api/reviewApi';
import { apiRequest } from '../../services/apiClient';

interface AnalysisClaim { areaId: string; componentId: string; observation: string; confidence: number; evidencePhotoIds: string[]; uncertainty?: string }
interface AnalysisProjection { claims: AnalysisClaim[]; applicability: 'current' | 'superseded'; model: string; promptVersion: string }

export const ReviewWorkspacePage: React.FC = () => {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const { userProfile } = useAuth();
  const agencyId = userProfile?.agencyId ?? 'unprovisioned-agency';
  const [aggregate, setAggregate] = useState<ReportAggregate>();
  const [rounds, setRounds] = useState<ReportReviewRound[]>([]);
  const [comments, setComments] = useState<ReportReviewComment[]>([]);
  const [body, setBody] = useState('');
  const [blocking, setBlocking] = useState(true);
  const [selectedComponent, setSelectedComponent] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisProjection>();

  const reload = async () => {
    const [workspace, nextRounds, nextComments] = await Promise.all([
      getReportWorkspace(agencyId, reportId), listReviewRounds(agencyId, reportId), listReviewComments(agencyId, reportId),
    ]);
    setAggregate(workspace); setRounds(nextRounds); setComments(nextComments);
    setAnalysis(workspace.report.analysisResultId ? await apiRequest<AnalysisProjection>(agencyId, `/api/v1/analysis-results/${encodeURIComponent(workspace.report.analysisResultId)}`) : undefined);
  };
  useEffect(() => { void reload().catch((error: Error) => setMessage(error.message)); }, [agencyId, reportId]);
  const currentRound = [...rounds].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  const components = useMemo(() => aggregate?.areas.flatMap((area) => area.components.map((component) => ({ area, component }))) ?? [], [aggregate]);
  const openBlocking = comments.filter((comment) => comment.status === 'open' && comment.blocking);

  const ensureRound = async (): Promise<ReportReviewRound> => currentRound ?? createReviewRound(agencyId, reportId);
  const addComment = async (event: React.FormEvent) => {
    event.preventDefault(); if (!body.trim()) return;
    setBusy(true);
    try {
      const round = await ensureRound();
      const selected = components.find(({ component }) => component.id === selectedComponent);
      await addReviewComment(agencyId, reportId, {
        roundId: round.id, body: body.trim(), blocking,
        ...(selected ? { areaId: selected.area.id, componentId: selected.component.id } : {}),
      });
      setBody(''); await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Comment could not be saved.'); }
    finally { setBusy(false); }
  };

  const decide = async (command: 'complete-analyst-review' | 'approve' | 'request-changes') => {
    if (!aggregate?.report.version) return;
    setBusy(true); setMessage('');
    try {
      if (command !== 'request-changes') {
        const quality = await runReportQuality(agencyId, reportId, command === 'approve' ? 'reviewer_approval' : 'analyst_completion');
        if (quality.status !== 'ready') throw new Error(`${quality.results.filter((result) => result.blocking).length} blocking quality findings remain.`);
      }
      const reason = command === 'request-changes' ? window.prompt('Reason for returning the report')?.trim() : undefined;
      if (command === 'request-changes' && !reason) return;
      await runReportCommand(agencyId, reportId, command, aggregate.report.version, reason);
      setMessage(command === 'approve' ? 'Independent approval recorded.' : command === 'complete-analyst-review' ? 'Analyst decision recorded.' : 'Report returned for correction.');
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review decision failed.'); }
    finally { setBusy(false); }
  };

  if (!aggregate) return <div className="rounded-xl border border-ink-200 bg-white p-8 text-sm text-ink-500">Loading immutable review context…</div>;
  const analystMode = userProfile?.role === 'analyst';
  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-ink-950 p-6 text-white shadow-lg"><Link to={`/app/admin/reports/${reportId}`} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-400 hover:text-white"><ArrowLeft size={14} /> Report record</Link><div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-400">Revision {aggregate.report.workspaceRevision ?? 1} · {analystMode ? 'Analyst review' : 'Independent review'}</p><h1 className="mt-1 font-serif text-3xl font-bold">{aggregate.report.propertyAddress}</h1><p className="mt-2 text-sm text-ink-400">The evidence and structured content shown here are the exact revision being decided.</p></div><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold capitalize text-ink-300">{aggregate.report.lifecycleStatus.replaceAll('_', ' ')}</span></div></header>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-3" aria-labelledby="assessment-heading"><h2 id="assessment-heading" className="font-serif text-xl font-bold text-ink-950">Assessment evidence</h2>{analysis ? <div className={`rounded-xl border p-4 ${analysis.applicability === 'current' ? 'border-accent-200 bg-accent-50' : 'border-ink-300 bg-ink-100'}`}><p className="text-xs font-black uppercase tracking-wider text-accent-800">Grounded analysis suggestions · {analysis.model}</p><p className="mt-1 text-xs text-ink-600">Suggestions never overwrite inspector findings. Validate each observation against its cited evidence.</p><ul className="mt-3 space-y-2">{analysis.claims.map((claim, index) => <li key={`${claim.componentId}:${index}`} className="rounded-lg bg-white p-3 text-sm"><p className="leading-6 text-ink-800">{claim.observation}</p><p className="mt-1 text-xs font-semibold text-ink-500">Component {claim.componentId} · confidence {Math.round(claim.confidence * 100)}% · evidence {claim.evidencePhotoIds.join(', ')}{claim.uncertainty ? ` · ${claim.uncertainty}` : ''}</p></li>)}</ul></div> : null}{aggregate.areas.map((area) => <article key={area.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white"><div className="border-b border-ink-100 bg-ink-50 px-4 py-3"><h3 className="font-bold text-ink-950">{area.name}</h3></div><ul className="divide-y divide-ink-100">{area.components.map((component) => <li key={component.id} className="grid gap-3 p-4 md:grid-cols-[180px_minmax(0,1fr)_130px]"><div><p className="font-bold text-ink-900">{component.component}</p><p className="mt-1 text-xs capitalize text-ink-500">{component.conditionCategory.replaceAll('_', ' ')}</p></div><p className="text-sm leading-6 text-ink-700">{component.commentary || 'No commentary recorded.'}</p><p className="text-xs font-semibold text-ink-500">{component.photoReferences.length} evidence item{component.photoReferences.length === 1 ? '' : 's'}</p></li>)}</ul></article>)}</section>
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-xl border border-ink-200 bg-white p-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[11px] uppercase tracking-wider text-accent-700">Review round</p><h2 className="mt-1 font-bold text-ink-950">Comments and blockers</h2></div><MessageSquareWarning className="text-accent-700" /></div><p className="mt-3 text-xs text-ink-500">{currentRound ? `Round ${currentRound.id.slice(0, 8)} · revision ${currentRound.workspaceRevision}` : 'A round is created with the first comment.'}</p><ul className="mt-4 space-y-2">{comments.length ? comments.map((comment) => <li key={comment.id} className={`rounded-lg border p-3 text-sm ${comment.status === 'resolved' ? 'border-ink-200 bg-ink-50 text-ink-500' : comment.blocking ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}><div className="flex justify-between gap-3"><p className="leading-5">{comment.body}</p><span className="text-[10px] font-black uppercase">{comment.status}</span></div>{comment.status === 'open' ? <button type="button" disabled={busy} onClick={() => void resolveReviewComment(agencyId, reportId, comment).then(reload)} className="mt-2 text-xs font-bold underline">Resolve</button> : null}</li>) : <li className="rounded-lg border border-dashed border-ink-300 p-3 text-xs text-ink-500">No review comments.</li>}</ul></section>
          <form onSubmit={addComment} className="rounded-xl border border-ink-200 bg-white p-5"><label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-600">Attach to<select value={selectedComponent} onChange={(event) => setSelectedComponent(event.target.value)} className="rounded-lg border border-ink-300 px-3 py-2.5 text-sm font-normal normal-case"><option value="">Whole report</option>{components.map(({ area, component }) => <option key={`${area.id}:${component.id}`} value={component.id}>{area.name} · {component.component}</option>)}</select></label><label className="mt-3 grid gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-600">Comment<textarea required value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="rounded-lg border border-ink-300 px-3 py-2.5 text-sm font-normal normal-case" /></label><label className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink-700"><input type="checkbox" checked={blocking} onChange={(event) => setBlocking(event.target.checked)} /> Blocks approval</label><button disabled={busy || !body.trim()} className="mt-4 w-full rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Add review comment</button></form>
          <section className="rounded-xl border border-ink-200 bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck className="text-emerald-700" /><h2 className="font-bold text-ink-950">Decision</h2></div>{openBlocking.length ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-red-700"><AlertTriangle className="mt-0.5 shrink-0" size={15} /> {openBlocking.length} blocking comment{openBlocking.length === 1 ? '' : 's'} must be resolved.</p> : <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 size={15} /> No open blocking comments</p>}<div className="mt-4 grid gap-2">{analystMode ? <button type="button" disabled={busy || openBlocking.length > 0} onClick={() => void decide('complete-analyst-review')} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Complete analyst review</button> : <button type="button" disabled={busy || openBlocking.length > 0} onClick={() => void decide('approve')} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Approve exact revision</button>}<button type="button" disabled={busy} onClick={() => void decide('request-changes')} className="rounded-lg border border-ink-300 px-4 py-2.5 text-sm font-bold text-ink-700">Request changes</button></div>{message ? <p role="status" className="mt-3 text-xs leading-5 text-ink-600">{message}</p> : null}</section>
        </aside>
      </div>
    </div>
  );
};
