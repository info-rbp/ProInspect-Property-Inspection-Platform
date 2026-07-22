import React, { useEffect } from 'react';
import ReportBuilder from '../../components/reports/ReportBuilder';
import { useShell } from '../../contexts/ShellContext';

const ReportEditPage: React.FC = () => {
  const { setHasPendingChanges } = useShell();

  useEffect(() => {
    setHasPendingChanges(false);
    return () => setHasPendingChanges(false);
  }, [setHasPendingChanges]);

  const markPending = () => setHasPendingChanges(true);

  return (
    <div onChangeCapture={markPending} onInputCapture={markPending}>
      <ReportBuilder />
    </div>
  );
};

export default ReportEditPage;
