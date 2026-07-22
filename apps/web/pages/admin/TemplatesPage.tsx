import React from 'react';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import { CheckCircle2, FileStack, LockKeyhole } from 'lucide-react';

const TemplatesPage: React.FC = () => (
  <div className="space-y-6">
    <header className="overflow-hidden rounded-2xl bg-stone-950 p-6 text-white shadow-lg"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-400">Controlled configuration</p><h1 className="mt-2 font-serif text-3xl font-bold">Inspection template library</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">Published WA templates are immutable, evidence-aware, and bound to each report at booking.</p></header>
    <div className="grid gap-4 lg:grid-cols-3">
      {WA_RESIDENTIAL_V1_TEMPLATES.map((template) => {
        const componentCount = template.areas.reduce((count, area) => count + area.components.length, 0);
        return <article key={template.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-800"><FileStack size={20} /></span><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 size={13} /> Published</span></div><h2 className="mt-5 font-serif text-xl font-bold capitalize text-stone-950">{template.inspectionType} residential</h2><p className="mt-1 font-mono text-xs text-stone-500">v{template.version} · {template.jurisdiction}</p><dl className="mt-5 grid grid-cols-2 gap-3 border-y border-stone-100 py-4 text-sm"><div><dt className="text-xs text-stone-500">Areas</dt><dd className="mt-1 font-bold text-stone-900">{template.areas.length}</dd></div><div><dt className="text-xs text-stone-500">Components</dt><dd className="mt-1 font-bold text-stone-900">{componentCount}</dd></div></dl><div className="mt-4 flex items-center gap-2 text-xs font-semibold text-stone-600"><LockKeyhole size={14} /> Immutable published version</div><p className="mt-2 truncate font-mono text-[10px] text-stone-600" title={template.contentHash}>{template.contentHash}</p></article>;
      })}
    </div>
  </div>
);

export default TemplatesPage;
