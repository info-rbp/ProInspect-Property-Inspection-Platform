import React, { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { listQueuedMutations, type QueuedMutation } from '../../services/offline/offlineQueue';
import { synchroniseQueuedMutations } from '../../services/offline/syncCoordinator';

const SyncQueuePanel: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const agencyId = userProfile?.agencyId;
    if (!currentUser || !agencyId) return setItems([]);
    setItems(await listQueuedMutations(currentUser.uid, agencyId));
  }, [currentUser, userProfile]);

  useEffect(() => {
    void refresh();
    window.addEventListener('proinspect:offline-queue-changed', refresh);
    return () => window.removeEventListener('proinspect:offline-queue-changed', refresh);
  }, [refresh]);

  if (!items.length) return null;

  const syncNow = async () => {
    const agencyId = userProfile?.agencyId;
    if (!currentUser || !agencyId) return;
    setSyncing(true);
    try { await synchroniseQueuedMutations(currentUser.uid, agencyId); } finally { setSyncing(false); await refresh(); }
  };

  return (
    <aside className="fixed bottom-4 left-4 z-40 max-w-sm" aria-label="Unsynchronised changes">
      {open ? (
        <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-semibold text-brand-600">Unsynchronised changes</h2><p className="text-xs text-gray-600">Stored for this signed-in user and agency only.</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close sync queue"><X size={18} /></button>
          </div>
          <ul className="mt-3 max-h-52 space-y-2 overflow-auto text-sm">
            {items.map((item) => <li key={item.id} className="rounded bg-gray-50 p-2"><strong>{item.entityType}</strong>{item.entityId ? ` ${item.entityId}` : ''}<div className="text-xs text-gray-600">{item.status}{item.lastError ? ` — ${item.lastError}` : ''}</div></li>)}
          </ul>
          <button type="button" disabled={syncing || !navigator.onLine} onClick={syncNow} className="mt-3 inline-flex items-center gap-2 rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> Synchronise now</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg"><CloudOff size={16} /> {items.length} unsynchronised</button>
      )}
    </aside>
  );
};

export default SyncQueuePanel;
