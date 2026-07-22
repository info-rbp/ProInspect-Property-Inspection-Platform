import React from 'react';
import type { QualityRun } from '@pcr/quality';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export const CompletionSummary: React.FC<{ quality: QualityRun; progress: { assessed: number; total: number; percent: number } }> = ({ quality, progress }) => (
  <section className="rounded-2xl border border-stone-200 bg-stone-950 p-5 text-white" aria-labelledby="completion-heading">
    <div className="flex items-start justify-between"><div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-400">Readiness gate</p><h2 id="completion-heading" className="mt-1 font-serif text-xl font-bold">{quality.status === 'ready' ? 'Ready for submission' : `${quality.results.filter((item) => item.blocking).length} blockers remain`}</h2></div>{quality.status === 'ready' ? <ShieldCheck className="text-emerald-400" /> : <AlertTriangle className="text-amber-400" />}</div>
    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${progress.percent}%` }} /></div>
    <div className="mt-2 flex justify-between text-xs text-stone-400"><span>{progress.assessed} of {progress.total} assessed</span><span>{quality.score}/100 quality</span></div>
    {quality.results.length ? <ul className="mt-4 max-h-40 space-y-2 overflow-auto pr-1 text-xs">{quality.results.slice(0, 6).map((result, index) => <li key={`${result.ruleId}-${result.componentId ?? index}`} className="rounded-lg bg-white/8 px-3 py-2 leading-5 text-stone-200"><span className="font-bold text-amber-300">{result.ruleId}</span> — {result.message}</li>)}</ul> : <p className="mt-4 text-sm text-stone-300">All deterministic Phase 1 checks pass for this draft.</p>}
  </section>
);
