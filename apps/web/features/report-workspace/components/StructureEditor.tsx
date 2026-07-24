import React, { useEffect, useState } from 'react';
import type { ReportAggregate } from '@pcr/domain';
import { ArrowDown, ArrowUp, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';

type Area = ReportAggregate['areas'][number];
type Component = Area['components'][number];

export const StructureEditor: React.FC<{
  areas: ReportAggregate['areas'];
  selectedArea?: Area;
  selectedComponent?: Component;
  cloudEnabled: boolean;
  busy: boolean;
  onAddArea: (name: string) => Promise<void>;
  onRenameArea: (area: Area, name: string) => Promise<void>;
  onRemoveArea: (area: Area) => Promise<void>;
  onMoveArea: (areaId: string, offset: number) => Promise<void>;
  onAddComponent: (areaId: string, name: string) => Promise<void>;
  onRemoveComponent: (areaId: string, componentId: string) => Promise<void>;
  onMoveComponent: (areaId: string, componentId: string, offset: number) => Promise<void>;
}> = ({
  areas, selectedArea, selectedComponent, cloudEnabled, busy,
  onAddArea, onRenameArea, onRemoveArea, onMoveArea, onAddComponent, onRemoveComponent, onMoveComponent,
}) => {
  const [areaName, setAreaName] = useState('');
  const [componentName, setComponentName] = useState('');
  const [renamedArea, setRenamedArea] = useState(selectedArea?.name ?? '');
  const areaIndex = selectedArea ? areas.findIndex((area) => area.id === selectedArea.id) : -1;
  const componentIndex = selectedArea && selectedComponent ? selectedArea.components.findIndex((component) => component.id === selectedComponent.id) : -1;

  useEffect(() => setRenamedArea(selectedArea?.name ?? ''), [selectedArea?.id, selectedArea?.name]);

  const submitArea = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!areaName.trim()) return;
    await onAddArea(areaName.trim());
    setAreaName('');
  };
  const submitComponent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArea || !componentName.trim()) return;
    await onAddComponent(selectedArea.id, componentName.trim());
    setComponentName('');
  };

  return <section className="rounded-2xl border border-ink-200 bg-white p-4" aria-labelledby="structure-heading">
    <div className="flex items-center gap-2"><FolderPlus size={18} className="text-accent-700" /><h2 id="structure-heading" className="font-bold text-ink-950">Report structure</h2></div>
    <p className="mt-1 text-xs leading-5 text-ink-500">Published templates remain immutable. These controls record report-specific additions and ordering.</p>
    {!cloudEnabled ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Connect the cloud workspace to change report structure.</p> : null}

    <form onSubmit={submitArea} className="mt-4 flex gap-2">
      <label className="sr-only" htmlFor="new-area-name">New area name</label>
      <input id="new-area-name" value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Add an unusual area" className="min-w-0 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm" disabled={!cloudEnabled || busy} />
      <button type="submit" disabled={!cloudEnabled || busy || !areaName.trim()} className="grid h-10 w-10 place-items-center rounded-lg bg-ink-950 text-white disabled:opacity-30" aria-label="Add area"><Plus size={17} /></button>
    </form>

    {selectedArea ? <div className="mt-4 space-y-3 border-t border-ink-200 pt-4">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wider text-ink-500">Selected area<input value={renamedArea} onChange={(event) => setRenamedArea(event.target.value)} className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium normal-case tracking-normal text-ink-900" disabled={!cloudEnabled || busy} /></label>
        <button type="button" disabled={!cloudEnabled || busy || !renamedArea.trim() || renamedArea.trim() === selectedArea.name} onClick={() => void onRenameArea(selectedArea, renamedArea.trim())} className="grid h-10 w-10 place-items-center rounded-lg border border-ink-300 text-ink-700 disabled:opacity-30" aria-label="Rename selected area"><Pencil size={15} /></button>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!cloudEnabled || busy || areaIndex <= 0} onClick={() => void onMoveArea(selectedArea.id, -1)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-ink-300 text-xs font-bold disabled:opacity-30"><ArrowUp size={14} /> Earlier</button>
        <button type="button" disabled={!cloudEnabled || busy || areaIndex < 0 || areaIndex === areas.length - 1} onClick={() => void onMoveArea(selectedArea.id, 1)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-ink-300 text-xs font-bold disabled:opacity-30"><ArrowDown size={14} /> Later</button>
        <button type="button" disabled={!cloudEnabled || busy || areas.length <= 1} onClick={() => { if (window.confirm(`Remove ${selectedArea.name} and all of its components from this draft report?`)) void onRemoveArea(selectedArea); }} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-700 disabled:opacity-30" aria-label="Remove selected area"><Trash2 size={14} /></button>
      </div>

      <form onSubmit={submitComponent} className="flex gap-2">
        <label className="sr-only" htmlFor="new-component-name">New component name</label>
        <input id="new-component-name" value={componentName} onChange={(event) => setComponentName(event.target.value)} placeholder={`Add component to ${selectedArea.name}`} className="min-w-0 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-sm" disabled={!cloudEnabled || busy} />
        <button type="submit" disabled={!cloudEnabled || busy || !componentName.trim()} className="grid h-10 w-10 place-items-center rounded-lg bg-accent-500 text-white disabled:opacity-30" aria-label="Add component"><Plus size={17} /></button>
      </form>

      {selectedComponent ? <div className="rounded-lg bg-ink-50 p-3">
        <p className="truncate text-xs font-bold text-ink-800">{selectedComponent.component}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!cloudEnabled || busy || componentIndex <= 0} onClick={() => void onMoveComponent(selectedArea.id, selectedComponent.id, -1)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white text-xs font-bold disabled:opacity-30"><ArrowUp size={14} /> Earlier</button>
          <button type="button" disabled={!cloudEnabled || busy || componentIndex < 0 || componentIndex === selectedArea.components.length - 1} onClick={() => void onMoveComponent(selectedArea.id, selectedComponent.id, 1)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white text-xs font-bold disabled:opacity-30"><ArrowDown size={14} /> Later</button>
          <button type="button" disabled={!cloudEnabled || busy || selectedArea.components.length <= 1} onClick={() => { if (window.confirm(`Remove ${selectedComponent.component} from this draft report?`)) void onRemoveComponent(selectedArea.id, selectedComponent.id); }} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-white text-red-700 disabled:opacity-30" aria-label="Remove selected component"><Trash2 size={14} /></button>
        </div>
      </div> : null}
    </div> : null}
  </section>;
};
