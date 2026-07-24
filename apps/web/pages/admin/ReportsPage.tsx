import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, FileInput } from 'lucide-react';
import type { ReportIndex } from '../../types/platform';
import { listReportIndexes } from '../../services/platform/reportIndexService';

const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<ReportIndex[]>([]);

  useEffect(() => {
    void listReportIndexes().then(setReports);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-brand-600">Reports</h1>
          <p className="text-sm text-gray-600">Canonical reports created from inspection bookings or controlled historical workflows.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/inspection-jobs" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <CalendarPlus size={16} /> Book inspection
          </Link>
          <Link to="/app/admin/operations/imports" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <FileInput size={16} /> Import historical report
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm text-accent-900">
        Ordinary Entry, Routine and Exit reports are created by booking an inspection. Exceptional records require an administrator command with a recorded reason and published template.
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No reports yet. Book an inspection or import a historical record.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Property</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Inspection date</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium text-brand-600"><Link to={`/app/admin/reports/${report.reportId}`}>{report.propertyAddress || 'Untitled property'}</Link></td>
                  <td className="p-3 text-gray-600">{report.reportType}</td>
                  <td className="p-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{report.lifecycleStatus.replaceAll('_', ' ')}</span></td>
                  <td className="p-3 text-gray-600">{report.inspectionDate || '-'}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Link className="text-accent-600 hover:underline" to={`/app/admin/reports/${report.reportId}/edit`}>Edit</Link>
                      <Link className="text-accent-600 hover:underline" to={`/app/admin/reports/${report.reportId}/preview`}>Preview</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
