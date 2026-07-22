import React, { useEffect } from 'react';
import ReportBuilder from '../../components/reports/ReportBuilder';
import { useShell } from '../../contexts/ShellContext';

const ReportEditPage: React.FC = () => {
  const { setHasPendingChanges } = useShell();

  useEffect(() => {
    setHasPendingChanges(false);
    return () => setHasPendingChanges(false);
  }, [setHasPendingChanges]);

  const handleChangeCapture = () => setHasPendingChanges(true);
  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest('button');
    if (button?.textContent?.toLowerCase().includes('save report')) {
      window.setTimeout(() => setHasPendingChanges(false), 750);
    }
  };

  return (
    <div onChangeCapture={handleChangeCapture} onInputCapture={handleChangeCapture} onClickCapture={handleClickCapture}>
      <ReportBuilder />
    </div>
  );
};

export default ReportEditPage;
