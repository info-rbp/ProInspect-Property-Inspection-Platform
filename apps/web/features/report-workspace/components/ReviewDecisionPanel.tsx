import React, { useState } from 'react';
import type { ReportAggregate } from '@pcr/domain';
import { Check, RotateCcw } from 'lucide-react';
import { runReportCommand, runReportQuality } from '../api/reportCommands';

export const ReviewDecisionPanel: React.FC<{ aggregate: ReportAggregate; agencyId: string; qualityReady: boolean; onCompleted: () => void }> = ({ aggregate, agencyId, qualityReady, onCompleted }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const execute = async (command: 'approve' | 'request-changes') => {
    if (!aggregate.report.version) { setMessage('Synchronise this legacy draft before workflow decisions.'); return; }
    const reason = command === 'request-changes' ? window.prompt('Reason for requested changes')?.trim() : undefined;
    if (command === 'request-changes' && !reason) return;
    setBusy(true); setMessage('');
    try {
      if (command === 'approve') {
        const run = await runReportQuality(agencyId, aggregate.report.id, 'reviewer_approval');
        if (run.status !== 'ready') { setMessage(`${run.results.filter((result) => result.blocking).length} server quality blockers remain.`); return; }
      }
      await runReportCommand(agencyId, aggregate.report.id, command, aggregate.report.version, reason); setMessage(command === 'approve' ? 'Approval recorded.' : 'Changes requested.'); onCompleted();
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Workflow command failed.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5" aria-labelledby="review-heading"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-700">Independent review</p><h2 id="review-heading" className="mt-1 text-base font-bold text-stone-950">Decision controls</h2><p className="mt-2 text-sm leading-6 text-stone-600">Approval applies to workspace revision {aggregate.report.workspaceRevision ?? 1}. Any later content edit invalidates it.</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={busy || !qualityReady || !navigator.onLine} onClick={() => void execute('approve')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Check size={16} /> Approve</button><button type="button" disabled={busy || !navigator.onLine} onClick={() => void execute('request-changes')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 disabled:opacity-40"><RotateCcw size={15} /> Return</button></div>{message ? <p role="status" className="mt-3 text-xs text-stone-600">{message}</p> : null}</section>
  );
};
