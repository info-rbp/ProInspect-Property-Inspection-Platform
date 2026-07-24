import React, { useEffect, useMemo, useState } from 'react';
import type { WorkQueueItem } from '@pcr/domain';
import { AlertCircle, ArrowRight, Clock3, Filter, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/apiClient';
import { listReportIndexes } from '../../services/platform/reportIndexService';

const priorityClass: Record<WorkQueueItem['priority'], string> = {
  normal: 'bg-ink-100 text-ink-700', high: 'bg-amber-100 text-amber-900', critical: 'bg-red-100 text-red-800',
};

export const WorkQueuePage: React.FC = () => {
  const { userProfile } = useAuth();
  const [items, setItems] = useState<WorkQueueItem[]>([]);
  const [stage, setStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'projection' | 'local'>('projection');
  useEffect(() => {
    const load = async () => {
      try {
        const agencyId = userProfile?.agencyId;
        if (!agencyId) throw new Error('Agency unavailable');
        setItems(await apiRequest<WorkQueueItem[]>(agencyId, '/api/v1/work-queue?limit=100'));
      } catch {
        const reports = await listReportIndexes();
        setItems(reports.filter((report) => !['archived', 'cancelled'].includes(report.lifecycleStatus)).map((report) => ({
          id: `local-${report.reportId}`, agencyId: report.agencyId ?? 'local', entityType: 'report', entityId: report.reportId,
          propertyId: report.propertyId, propertyAddress: report.propertyAddress, reportType: report.reportType,
          stage: report.lifecycleStatus, assignedUserIds: [], priority: report.lifecycleStatus === 'changes_requested' ? 'high' : 'normal',
          nextAction: report.lifecycleStatus === 'draft' ? 'Complete field assessment' : 'Review report stage', updatedAt: report.updatedAt,
        })));
        setSource('local');
      } finally { setLoading(false); }
    };
    void load();
  }, [userProfile?.agencyId]);
  const stages = useMemo(() => [...new Set(items.map((item) => item.stage))].sort(), [items]);
  const visible = stage === 'all' ? items : items.filter((item) => item.stage === stage);
  const blocked = items.filter((item) => item.blockedReason || item.exceptionCode).length;
  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-ink-950 p-6 text-white shadow-lg"><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-400">Operations control</p><div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-serif text-3xl font-bold">Work queue</h1><p className="mt-2 text-sm text-ink-400">Server-defined ownership, blockers and next actions across active reports.</p></div><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-ink-300">{source === 'projection' ? 'Live projection' : 'Local fallback'}</span></div></header>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-ink-200 bg-white p-4"><ListChecks className="text-accent-700" size={19} /><p className="mt-3 text-2xl font-bold text-ink-950">{items.length}</p><p className="text-xs text-ink-500">Active queue items</p></div><div className="rounded-xl border border-ink-200 bg-white p-4"><AlertCircle className="text-red-700" size={19} /><p className="mt-3 text-2xl font-bold text-ink-950">{blocked}</p><p className="text-xs text-ink-500">Blocked or failed</p></div><div className="rounded-xl border border-ink-200 bg-white p-4"><Clock3 className="text-accent-600" size={19} /><p className="mt-3 text-2xl font-bold text-ink-950">{items.filter((item) => item.priority !== 'normal').length}</p><p className="text-xs text-ink-500">Priority actions</p></div></div>
      <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3"><Filter size={17} className="text-ink-500" /><label htmlFor="queue-stage" className="text-xs font-bold uppercase tracking-wider text-ink-500">Stage</label><select id="queue-stage" value={stage} onChange={(event) => setStage(event.target.value)} className="rounded-lg border border-ink-300 px-3 py-2 text-sm"><option value="all">All stages</option>{stages.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">{loading ? <div className="p-8 text-center text-sm text-ink-500">Loading operational queue…</div> : visible.length === 0 ? <div className="p-8 text-center text-sm text-ink-500">No work matches this filter.</div> : <ul className="divide-y divide-ink-100">{visible.map((item) => <li key={item.id} className="grid gap-3 p-4 transition hover:bg-ink-50 md:grid-cols-[minmax(0,1fr)_180px_180px_34px] md:items-center"><div className="min-w-0"><p className="truncate text-sm font-bold text-ink-950">{item.propertyAddress || item.entityId}</p><p className="mt-1 text-xs text-ink-500">{item.reportType || item.entityType} · updated {new Date(item.updatedAt).toLocaleString()}</p>{item.blockedReason ? <p className="mt-2 text-xs font-semibold text-red-700">{item.blockedReason}</p> : null}</div><span className="text-xs font-semibold capitalize text-ink-600">{item.stage.replaceAll('_', ' ')}</span><div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityClass[item.priority]}`}>{item.priority}</span><p className="mt-2 text-xs text-ink-600">{item.nextAction}</p></div><Link to={`/app/admin/reports/${item.entityId}`} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-950 hover:text-white" aria-label={`Open ${item.propertyAddress || item.entityId}`}><ArrowRight size={15} /></Link></li>)}</ul>}</div>
    </div>
  );
};
