import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { InspectionJob, PropertyRecord } from '../../types/platform';
import { getInspectionJob } from '../../services/platform/inspectionJobService';
import { getProperty } from '../../services/platform/propertyService';

const InspectionJobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<InspectionJob | null>(null);
  const [property, setProperty] = useState<PropertyRecord | null>(null);

  useEffect(() => {
    const loadJob = async () => {
      if (!jobId) {
        return;
      }

      const nextJob = await getInspectionJob(jobId);
      setJob(nextJob || null);
      if (nextJob) {
        setProperty(await getProperty(nextJob.propertyId) || null);
      }
    };

    loadJob();
  }, [jobId]);

  if (!job) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Inspection job not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">{property?.address || 'Inspection job'}</h1>
        <p className="text-sm text-gray-600">{job.reportType} - {job.status.replaceAll('_', ' ')}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4 md:grid-cols-2">
          <div><dt className="text-xs uppercase text-gray-500">Scheduled</dt><dd className="font-semibold">{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : 'Not scheduled'}</dd></div>
          <div><dt className="text-xs uppercase text-gray-500">Inspector</dt><dd className="font-semibold">{job.assignedInspectorId || '-'}</dd></div>
          <div><dt className="text-xs uppercase text-gray-500">Reviewer</dt><dd className="font-semibold">{job.assignedReviewerId || '-'}</dd></div>
          <div><dt className="text-xs uppercase text-gray-500">Report</dt><dd className="font-semibold">{job.reportId ? <Link className="text-blue-600" to={`/app/admin/reports/${job.reportId}/edit`}>Open report</Link> : 'No report linked'}</dd></div>
        </dl>
        {job.notes && <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">{job.notes}</p>}
      </div>
    </div>
  );
};

export default InspectionJobDetailPage;
