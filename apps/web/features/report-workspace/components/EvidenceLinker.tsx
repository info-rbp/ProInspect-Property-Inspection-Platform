import React from 'react';
import type { ReportAggregate } from '@pcr/domain';
import { Camera, Link2 } from 'lucide-react';

type Component = ReportAggregate['areas'][number]['components'][number];

export const EvidenceLinker: React.FC<{ component?: Component }> = ({ component }) => (
  <section className="rounded-2xl border border-stone-200 bg-white p-5" aria-labelledby="evidence-heading">
    <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-700">Evidence links</p><h2 id="evidence-heading" className="mt-1 text-base font-bold text-stone-950">Component evidence</h2></div><Link2 size={19} className="text-stone-400" /></div>
    {!component?.photoReferences.length ? <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center"><Camera className="mx-auto text-stone-400" size={22} /><p className="mt-2 text-sm font-semibold text-stone-700">No explicit evidence linked</p><p className="mt-1 text-xs leading-5 text-stone-500">Area photos are not silently copied here. Link the exact context, defect or testing evidence.</p></div> : <ul className="mt-4 space-y-2">{component.photoReferences.map((photo, index) => <li key={photo.photoId} className="flex items-center gap-3 rounded-lg border border-stone-200 p-3"><span className="grid h-8 w-8 place-items-center rounded bg-stone-100 font-mono text-xs text-stone-600">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{photo.caption || photo.photoId}</span><span className="text-xs text-stone-400">linked</span></li>)}</ul>}
  </section>
);
