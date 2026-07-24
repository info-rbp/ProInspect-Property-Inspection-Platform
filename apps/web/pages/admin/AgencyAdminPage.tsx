import React, { useEffect, useState } from 'react';
import type { Agency } from '../../types/platform';
import { listAgencies, updateAgency } from '../../services/platform/administrationService';

const AgencyAdminPage: React.FC = () => {
  const [agency, setAgency] = useState<Agency>();
  const [form, setForm] = useState<Partial<Agency>>({});
  const [message, setMessage] = useState('');

  useEffect(() => { listAgencies().then((items) => { setAgency(items[0]); setForm(items[0] ?? {}); }).catch((error) => setMessage(error.message)); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agency) return;
    try { const saved = await updateAgency(agency, form); setAgency(saved); setForm(saved); setMessage('Agency configuration saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-brand-600">Agency administration</h1><p className="text-sm text-gray-600">Legal identity, operating defaults, sender identity, branding and retention references.</p></div>
    {message ? <div role="status" className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">{message}</div> : null}
    {agency ? <form onSubmit={save} className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-2">
      {([['name', 'Legal name'], ['tradingName', 'Trading name'], ['abn', 'ABN'], ['contactEmail', 'Contact email'], ['contactPhone', 'Contact phone'], ['timezone', 'Timezone'], ['jurisdiction', 'Jurisdiction'], ['reportSenderName', 'Report sender name'], ['reportSenderEmail', 'Report sender email'], ['retentionPolicyId', 'Retention policy ID'], ['brandingVersionId', 'Branding version ID']] as const).map(([field, label]) => <label key={field} className="grid gap-1 text-sm font-medium text-gray-700">{label}<input value={String(form[field] ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="rounded-lg border border-gray-300 p-2" /></label>)}
      <label className="grid gap-1 text-sm font-medium text-gray-700">Default inspection duration (minutes)<input type="number" min="15" value={form.defaultInspectionDurationMinutes ?? 60} onChange={(event) => setForm((current) => ({ ...current, defaultInspectionDurationMinutes: Number(event.target.value) }))} className="rounded-lg border border-gray-300 p-2" /></label>
      <div className="md:col-span-2"><button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save agency</button></div>
    </form> : <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">No agency record is available.</div>}
  </div>;
};
export default AgencyAdminPage;
