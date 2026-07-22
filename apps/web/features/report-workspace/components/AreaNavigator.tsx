import React from 'react';
import type { ReportAggregate } from '@pcr/domain';
import { CheckCircle2, CircleDashed } from 'lucide-react';

export const AreaNavigator: React.FC<{ areas: ReportAggregate['areas']; selectedAreaId?: string; onSelect: (areaId: string) => void }> = ({ areas, selectedAreaId, onSelect }) => (
  <nav aria-label="Report areas" className="space-y-1.5">
    {areas.map((area, index) => {
      const complete = area.components.length > 0 && area.components.every((component) => component.commentary.trim() && component.conditionCategory !== 'unable_to_confirm');
      return (
        <button key={area.id} type="button" onClick={() => onSelect(area.id)} aria-current={selectedAreaId === area.id ? 'step' : undefined}
          className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selectedAreaId === area.id ? 'border-amber-400 bg-amber-50 text-stone-950 shadow-sm' : 'border-transparent text-stone-600 hover:border-stone-200 hover:bg-white'}`}>
          <span className="w-6 font-mono text-[11px] text-stone-400">{String(index + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{area.name}</span>
          {complete ? <CheckCircle2 size={16} className="text-emerald-600" aria-label="Complete" /> : <CircleDashed size={16} className="text-stone-400" aria-label="Incomplete" />}
        </button>
      );
    })}
  </nav>
);
