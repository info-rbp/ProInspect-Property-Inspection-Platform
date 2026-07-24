import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { PropertyRecord, Tenancy } from '../../types/platform';
import { commandTenancy, createTenancy, listProperties, listTenancies } from '../../services/platform/administrationService';

const TenanciesPage: React.FC = () => {
  const { userProfile } = useAuth();
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [tenantNames, setTenantNames] = useState('');
  const [tenantEmails, setTenantEmails] = useState('');
  const [error, setError] = useState('');
  const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);
  const load = async () => { const [nextTenancies, nextProperties] = await Promise.all([listTenancies(), listProperties()]); setTenancies(nextTenancies); setProperties(nextProperties); setPropertyId((current) => current || nextProperties[0]?.id || ''); };
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userProfile?.agencyId) return;
    try { await createTenancy({ agencyId: userProfile.agencyId, propertyId, tenantNames: tenantNames.split(',').map((value) => value.trim()).filter(Boolean), tenantEmails: tenantEmails.split(',').map((value) => value.trim()).filter(Boolean), status: 'invited' }); setTenantNames(''); setTenantEmails(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const command = async (tenancy: Tenancy, action: 'activate' | 'end') => { try { await commandTenancy(tenancy, action); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold text-brand-600">Tenancies</h1><p className="text-sm text-gray-600">Create, activate and close tenancy records with active-tenancy conflict controls.</p></div>{error ? <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}<form onSubmit={submit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-2"><select required value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="rounded-lg border border-gray-300 p-2"><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}</select><input required placeholder="Tenant names, comma separated" value={tenantNames} onChange={(event) => setTenantNames(event.target.value)} className="rounded-lg border border-gray-300 p-2" /><input placeholder="Tenant emails, comma separated" value={tenantEmails} onChange={(event) => setTenantEmails(event.target.value)} className="rounded-lg border border-gray-300 p-2" /><button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Create tenancy</button></form><div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Property</th><th className="p-3">Tenants</th><th className="p-3">Lease</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{tenancies.map((tenancy) => <tr key={tenancy.id}><td className="p-3 font-semibold text-brand-600">{propertyById.get(tenancy.propertyId)?.address || tenancy.propertyId}</td><td className="p-3">{tenancy.tenantNames.join(', ')}</td><td className="p-3">{tenancy.leaseStartDate || '-'} to {tenancy.leaseEndDate || '-'}</td><td className="p-3 capitalize">{tenancy.status}</td><td className="p-3"><div className="flex gap-2">{tenancy.status !== 'active' ? <button onClick={() => command(tenancy, 'activate')} className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold">Activate</button> : <button onClick={() => command(tenancy, 'end')} className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold">End tenancy</button>}</div></td></tr>)}</tbody></table></div></div>;
};
export default TenanciesPage;
