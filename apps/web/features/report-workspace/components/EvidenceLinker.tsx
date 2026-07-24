import React, { useRef, useState } from 'react';
import type { ReportAggregate } from '@pcr/domain';
import { ArrowDown, ArrowUp, Camera, FileVideo2, Link2, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { uploadEvidenceFile, type EvidenceUploadContext } from '../../evidence/api/evidenceClient';

type Component = ReportAggregate['areas'][number]['components'][number];
type EvidencePurpose = 'overview' | 'context' | 'defect' | 'testing' | 'meter' | 'key' | 'comparison' | 'completion';
type ManagedReference = Component['photoReferences'][number] & { purpose?: EvidencePurpose; contentType?: string };

const purposes: Array<{ value: EvidencePurpose; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'context', label: 'Context' },
  { value: 'defect', label: 'Defect' },
  { value: 'testing', label: 'Testing' },
  { value: 'meter', label: 'Meter' },
  { value: 'key', label: 'Key / access' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'completion', label: 'Completion' },
];

function ordered(component?: Component): ManagedReference[] {
  return [...(component?.photoReferences ?? [])]
    .map((reference, index) => ({ ...reference, sequence: reference.sequence ?? index + 1 }))
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
}

export const EvidenceLinker: React.FC<{
  component?: Component;
  agencyId: string;
  context?: EvidenceUploadContext;
  onChange: (photoReferences: Component['photoReferences']) => void;
}> = ({ component, agencyId, context, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const references = ordered(component);

  const commit = (next: ManagedReference[]) => {
    onChange(next.map((reference, index) => ({ ...reference, sequence: index + 1 })) as Component['photoReferences']);
  };

  const patch = (photoId: string, values: Partial<ManagedReference>) => {
    commit(references.map((reference) => reference.photoId === photoId ? { ...reference, ...values } : reference));
  };

  const move = (photoId: string, offset: number) => {
    const index = references.findIndex((reference) => reference.photoId === photoId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= references.length) return;
    const next = [...references];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length || !component || !context) return;
    setUploading(true); setError(undefined); setProgress(0);
    try {
      const next = [...references];
      for (const file of files) {
        const evidence = await uploadEvidenceFile(agencyId, context, file, setProgress);
        if (next.some((reference) => reference.photoId === evidence.id)) continue;
        next.push({
          photoId: evidence.id,
          objectPath: evidence.objectPath,
          generation: evidence.generation,
          sha256: evidence.sha256,
          ...(evidence.thumbnailObjectPath ? { thumbnailObjectPath: evidence.thumbnailObjectPath } : {}),
          caption: file.name,
          sequence: next.length + 1,
          purpose: component.defects.length || component.maintenanceRequired ? 'defect' : 'context',
          contentType: evidence.contentType,
        });
      }
      commit(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evidence could not be uploaded.');
    } finally {
      setUploading(false); setProgress(0);
    }
  };

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5" aria-labelledby="evidence-heading">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3"><span className="rounded-lg bg-ink-950 p-2 text-accent-400"><Link2 size={19} /></span><div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-700">Evidence links</p><h2 id="evidence-heading" className="mt-1 text-base font-bold text-ink-950">Component evidence</h2><p className="mt-1 text-xs leading-5 text-ink-500">Link only evidence that supports this component. Originals remain immutable.</p></div></div>
        <div>
          <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={upload} disabled={!component || !context || uploading} />
          <button type="button" disabled={!component || !context || uploading} onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink-950 px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}{uploading ? `Uploading ${progress}%` : 'Add evidence'}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!context && component ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This report is missing a property or inspection-job identifier, so new evidence cannot be uploaded until the report is linked to a booking.</p> : null}
      {!references.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-ink-300 bg-ink-50 p-5 text-center"><Camera className="mx-auto text-ink-400" size={22} /><p className="mt-2 text-sm font-semibold text-ink-700">No explicit evidence linked</p><p className="mt-1 text-xs leading-5 text-ink-500">Add context, defect or testing evidence before submitting this component.</p></div>
      ) : (
        <ol className="mt-4 space-y-3">
          {references.map((reference, index) => {
            const isVideo = reference.contentType?.startsWith('video/');
            return <li key={reference.photoId} className="rounded-xl border border-ink-200 bg-ink-50 p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-ink-600 shadow-sm">{isVideo ? <FileVideo2 size={19} /> : <Camera size={19} />}</span>
                <div className="min-w-0 flex-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-500">Caption<input value={reference.caption ?? ''} onChange={(event) => patch(reference.photoId, { caption: event.target.value })} className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-ink-900" placeholder="Describe what this evidence shows" /></label>
                  <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-ink-500">Purpose<select value={reference.purpose ?? 'context'} onChange={(event) => patch(reference.photoId, { purpose: event.target.value as EvidencePurpose })} className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-ink-900">{purposes.map((purpose) => <option key={purpose.value} value={purpose.value}>{purpose.label}</option>)}</select></label>
                  <p className="mt-2 truncate font-mono text-[10px] text-ink-500" title={reference.photoId}>{reference.photoId}</p>
                </div>
                <div className="grid gap-1">
                  <button type="button" disabled={index === 0} onClick={() => move(reference.photoId, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-ink-300 bg-white text-ink-700 disabled:opacity-30" aria-label={`Move ${reference.caption || reference.photoId} earlier`}><ArrowUp size={15} /></button>
                  <button type="button" disabled={index === references.length - 1} onClick={() => move(reference.photoId, 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-ink-300 bg-white text-ink-700 disabled:opacity-30" aria-label={`Move ${reference.caption || reference.photoId} later`}><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => commit(references.filter((candidate) => candidate.photoId !== reference.photoId))} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-white text-red-700" aria-label={`Unlink ${reference.caption || reference.photoId}`}><Trash2 size={15} /></button>
                </div>
              </div>
            </li>;
          })}
        </ol>
      )}
    </section>
  );
};
