import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { Client } from '../../types/platform';
import { createClient, listClients } from '../../services/platform/administrationService';

const ClientsPage: React.FC = () => {
  const { userProfile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<Client['type']>('owner');
  const [error, setError] = useState('');
  const load = () => listClients().then(setClients).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userProfile?.agencyId) return;
    try { await createClient({ agencyId: userProfile.agencyId, name, type, status: 'active' }); setName(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold text-brand-600">Clients and owners</h1><p className="text-sm text-gray-600">Manage the people and organisations linked to properties.</p></div>{error ? <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}<form onSubmit={submit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[1fr_200px_auto]"><input required placeholder="Client name" value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-gray-300 p-2" /><select value={type} onChange={(event) => setType(event.target.value as Client['type'])} className="rounded-lg border border-gray-300 p-2"><option value="owner">Owner</option><option value="landlord">Landlord</option><option value="agency">Agency</option><option value="other">Other</option></select><button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Add client</button></form><div className="overflow-hidden rounded-lg border border-gray-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Email</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100">{clients.map((client) => <tr key={client.id}><td className="p-3 font-semibold text-brand-600">{client.name}</td><td className="p-3 capitalize">{client.type}</td><td className="p-3">{client.email || '-'}</td><td className="p-3 capitalize">{client.status}</td></tr>)}</tbody></table></div></div>;
};
export default ClientsPage;
