import React, { useEffect, useState } from 'react';
import { subscribeToConflicts, type ConflictResolution, type MutationConflict } from '../../services/offline/conflictService';
import { removeQueuedMutation, updateQueuedMutation } from '../../services/offline/offlineQueue';

const options: Array<{ value: ConflictResolution; label: string; description: string }> = [
  { value: 'keep-server', label: 'Keep server version', description: 'Discard this queued local change.' },
  { value: 'overwrite-local', label: 'Overwrite with local version', description: 'Retry using the latest known server version; server permission is still required.' },
  { value: 'manual-merge', label: 'Manually merge', description: 'Keep the conflict queued while you compare both versions.' },
  { value: 'save-as-copy', label: 'Save local content as a copy', description: 'Keep the local content available for a copy workflow.' },
];

const ConflictResolutionDialog: React.FC = () => {
  const [conflict, setConflict] = useState<MutationConflict>();
  useEffect(() => subscribeToConflicts(setConflict), []);
  if (!conflict) return null;

  const resolve = async (resolution: ConflictResolution) => {
    if (resolution === 'keep-server') await removeQueuedMutation(conflict.queueId);
    if (resolution === 'overwrite-local') await updateQueuedMutation(conflict.queueId, {
      status: 'queued',
      baseVersion: conflict.serverVersion,
      body: conflict.submittedRecord && typeof conflict.submittedRecord === 'object'
        ? { ...conflict.submittedRecord as Record<string, unknown>, expectedVersion: conflict.serverVersion }
        : conflict.submittedRecord,
      lastError: undefined,
      nextAttemptAt: undefined,
    });
    if (resolution === 'save-as-copy') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(conflict.submittedRecord, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${conflict.entityType}-${conflict.entityId ?? 'new'}-local-copy.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      await removeQueuedMutation(conflict.queueId);
    }
    window.dispatchEvent(new CustomEvent('proinspect:conflict-resolution', { detail: { conflict, resolution } }));
    setConflict(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-600/60 p-4" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <h2 id="conflict-title" className="text-lg font-bold">Resolve synchronisation conflict</h2>
        <p className="mt-2 text-sm text-gray-600">The server has version {conflict.serverVersion} of this {conflict.entityType}. Choose how to preserve the work.</p>
        <div className="mt-4 grid gap-2">{options.map((option) => <button key={option.value} type="button" onClick={() => void resolve(option.value)} className="rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"><strong className="block text-sm">{option.label}</strong><span className="text-xs text-gray-600">{option.description}</span></button>)}</div>
      </div>
    </div>
  );
};

export default ConflictResolutionDialog;
