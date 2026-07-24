import React from 'react';
import type { ReportAggregate } from '@pcr/domain';

export const AreaEditor: React.FC<{
  area?: ReportAggregate['areas'][number]; selectedComponentId?: string; onSelect: (componentId: string) => void;
}> = ({ area, selectedComponentId, onSelect }) => {
  if (!area) return <div className="rounded-2xl border border-dashed border-ink-300 p-8 text-sm text-ink-500">Select an area to begin.</div>;
  return (
    <section aria-labelledby="area-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-700">Area assessment</p><h2 id="area-heading" className="mt-1 font-serif text-2xl font-bold text-ink-950">{area.name}</h2></div>
        <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-600">{area.components.length} components</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {area.components.map((component) => (
          <button key={component.id} type="button" onClick={() => onSelect(component.id)}
            className={`min-h-24 rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-accent-500 ${selectedComponentId === component.id ? 'border-ink-950 bg-ink-950 text-white shadow-lg' : 'border-ink-200 bg-white text-ink-900 hover:-translate-y-0.5 hover:border-ink-400 hover:shadow-sm'}`}>
            <span className="text-sm font-bold">{component.component}</span>
            <span className={`mt-4 block text-xs capitalize ${selectedComponentId === component.id ? 'text-ink-300' : 'text-ink-500'}`}>{component.conditionCategory.replaceAll('_', ' ')} · {component.visibility.replaceAll('_', ' ')}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
