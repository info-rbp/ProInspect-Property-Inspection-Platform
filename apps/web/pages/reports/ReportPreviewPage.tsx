import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Edit2, Printer } from 'lucide-react';
import PDFPreview from '../../components/PDFPreview';
import { ErrorState, LoadingState } from '../../components/layout/AsyncState';
import type { ReportData } from '../../types';
import { loadReportFromDB } from '../../services/storageService';
import { createShellOperationId, emitShellOperation } from '../../services/shellEvents';

interface PreviewLocationState {
  report?: ReportData;
}

const ReportPreviewPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const location = useLocation();
  const state = location.state as PreviewLocationState | null;
  const [report, setReport] = useState<ReportData | null>(state?.report || null);
  const [isLoading, setIsLoading] = useState(!state?.report);
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    const loadReport = async () => {
      if (state?.report || !reportId) {
        setIsLoading(false);
        return;
      }
      const operationId = createShellOperationId('preview-load');
      emitShellOperation({ id: operationId, kind: 'pdf', status: 'started', title: 'Loading report preview', source: reportId });
      setIsLoading(true);
      setLoadError(undefined);
      try {
        const loaded = await loadReportFromDB(reportId);
        setReport(loaded || null);
        if (!loaded) throw new Error('The report could not be found.');
        emitShellOperation({ id: operationId, kind: 'pdf', status: 'succeeded', title: 'Report preview ready', source: reportId });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The preview could not be loaded.';
        setLoadError(message);
        emitShellOperation({ id: operationId, kind: 'pdf', status: 'failed', title: 'Preview failed', message, source: reportId });
      } finally {
        setIsLoading(false);
      }
    };
    void loadReport();
  }, [reportId, state?.report]);

  if (isLoading) return <LoadingState title="Loading report preview" message="Retrieving the exact saved report content." />;
  if (loadError || !report) {
    return <ErrorState title="Report preview unavailable" message={loadError || 'The report could not be found.'} action={<Link to="/app/admin/reports" className="inline-flex rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">Back to reports</Link>} />;
  }

  return (
    <div className="min-h-screen bg-gray-600 py-8 print:bg-white print:p-0 print:m-0 print:h-auto print:w-full">
      <div className="fixed top-4 right-4 flex gap-4 no-print z-50">
        <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-medium focus:outline-none focus:ring-2 focus:ring-white">
          <Printer size={20} aria-hidden="true" /> Print / Save PDF
        </button>
        <Link to={`/app/admin/reports/${report.id}/edit`} className="bg-white hover:bg-gray-100 text-gray-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 font-medium focus:outline-none focus:ring-2 focus:ring-white">
          <Edit2 size={20} aria-hidden="true" /> Back to edit
        </Link>
      </div>
      <PDFPreview data={report} />
    </div>
  );
};

export default ReportPreviewPage;
