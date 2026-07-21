import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { InspectionJob, PropertyRecord } from '../../types/platform';
import { createInspectionJob, listInspectionJobs } from '../../services/platform/inspectionJobService';
import { listProperties } from '../../services/platform/propertyService';
import { DEFAULT_AGENCY_ID } from '../../services/platform/userProfileService';

const reportTypes: InspectionJob['reportType'][] = ['Property Condition Report', 'Routine Inspection', 'Exit Inspection'];

const InspectionJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    propertyId: '',
    reportType: 'Property Condition Report' as InspectionJob['reportType'],
    scheduledAt: '',
    assignedInspectorId: '',
    assignedReviewerId: '',
    notes: '',
  });

  const loadData = async () => {
    const [nextJobs, nextProperties] = await Promise.all([listInspectionJobs(), listProperties()]);
    setJobs(nextJobs);
    setProperties(nextProperties);
    setForm((prev) => ({ ...prev, propertyId: prev.propertyId || nextProperties[0]?.id || '' }));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await createInspectionJob({
      agencyId: DEFAULT_AGENCY_ID,
      propertyId: form.propertyId,
      reportType: form.reportType,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      assignedInspectorId: form.assignedInspectorId || undefined,
      assignedReviewerId: form.assignedReviewerId || undefined,
      notes: form.notes || undefined,
    });
    setIsCreating(false);
    setForm((prev) => ({ ...prev, scheduledAt: '', assignedInspectorId: '', assignedReviewerId: '', notes: '' }));
    await loadData();
  };

  const propertyName = (propertyId: string) => properties.find((property) => property.id === propertyId)?.address || propertyId;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Inspection Jobs</h1>
          <p className="text-sm text-gray-600">Schedule, assign and track inspection work.</p>
        </div>
        <button type="button" onClick={() => setIsCreating(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          <Plus size={16} /> Add job
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <select required value={form.propertyId} onChange={(event) => setForm((prev) => ({ ...prev, propertyId: event.target.value }))} className="rounded-lg border border-gray-300 p-2 text-sm">
            <option value="">Select property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}
          </select>
          <select value={form.reportType} onChange={(event) => setForm((prev) => ({ ...prev, reportType: event.target.value as InspectionJob['reportType'] }))} className="rounded-lg border border-gray-300 p-2 text-sm">
            {reportTypes.map((reportType) => <option key={reportType} value={reportType}>{reportType}</option>)}
          </select>
          <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((prev) => ({ ...prev, scheduledAt: event.target.value }))} className="rounded-lg border border-gray-300 p-2 text-sm" />
          <input placeholder="Assigned inspector ID" value={form.assignedInspectorId} onChange={(event) => setForm((prev) => ({ ...prev, assignedInspectorId: event.target.value }))} className="rounded-lg border border-gray-300 p-2 text-sm" />
          <input placeholder="Assigned reviewer ID" value={form.assignedReviewerId} onChange={(event) => setForm((prev) => ({ ...prev, assignedReviewerId: event.target.value }))} className="rounded-lg border border-gray-300 p-2 text-sm" />
          <input placeholder="Notes" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} className="rounded-lg border border-gray-300 p-2 text-sm" />
          <div className="flex gap-2 md:col-span-3">
            <button type="submit" disabled={!form.propertyId} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Create job</button>
            <button type="button" onClick={() => setIsCreating(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No inspection jobs yet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Property</th>
                <th className="p-3">Report type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Inspector</th>
                <th className="p-3">Reviewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-950"><Link to={`/app/admin/jobs/${job.id}`}>{propertyName(job.propertyId)}</Link></td>
                  <td className="p-3 text-gray-600">{job.reportType}</td>
                  <td className="p-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{job.status.replaceAll('_', ' ')}</span></td>
                  <td className="p-3 text-gray-600">{job.assignedInspectorId || '-'}</td>
                  <td className="p-3 text-gray-600">{job.assignedReviewerId || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default InspectionJobsPage;
