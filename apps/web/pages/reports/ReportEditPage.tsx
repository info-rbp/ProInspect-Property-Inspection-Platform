import React from 'react';
import { useParams } from 'react-router-dom';
import { ReportWorkspacePage } from '../../features/report-workspace/components/ReportWorkspacePage';
import { useDirtyForm } from '../../hooks/useDirtyForm';

const ReportEditPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const { formProps } = useDirtyForm({
    scopeId: `report:${reportId ?? 'new'}`,
    entityType: 'report',
    entityId: reportId && reportId !== 'new' ? reportId : undefined,
  });

  return (
    <div {...formProps}>
      <ReportWorkspacePage />
    </div>
  );
};

export default ReportEditPage;
