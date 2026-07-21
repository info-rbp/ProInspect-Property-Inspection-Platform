import { InspectionItem } from '../types';

export const ENTRY_REPORT_TYPE = 'Property Condition Report';
export const ROUTINE_REPORT_TYPE = 'Routine Inspection';
export const EXIT_REPORT_TYPE = 'Exit Inspection';
export const COMPARISON_REPORT_TYPE = 'Inspection Comparison Report';
export const MAINTENANCE_REPORT_TYPE = 'Maintenance and Follow-Up Report';

export const supportsComparison = (reportType: string): boolean => (
  reportType === ROUTINE_REPORT_TYPE || reportType === EXIT_REPORT_TYPE
);

export const isExitReport = (reportType: string): boolean => reportType === EXIT_REPORT_TYPE;

export const getReportDisplayTitle = (reportType: string): string => {
  switch (reportType) {
    case ROUTINE_REPORT_TYPE:
      return 'Routine Inspection Report';
    case EXIT_REPORT_TYPE:
      return 'Exit Condition Report';
    case COMPARISON_REPORT_TYPE:
      return 'Inspection Comparison Report';
    case MAINTENANCE_REPORT_TYPE:
      return 'Maintenance and Follow-Up Report';
    case ENTRY_REPORT_TYPE:
    default:
      return 'Property Condition Report';
  }
};

export const getReportFooterLabel = (reportType: string): string => {
  return isExitReport(reportType) ? 'End of Tenancy Report' : getReportDisplayTitle(reportType);
};

export const getAggregateRoomStatus = (items: InspectionItem[]) => {
  if (items.length === 0) {
    return {
      isClean: null,
      isUndamaged: null,
      isWorking: null,
    };
  }

  const workingStatuses = items.map((item) => item.workingStatus ?? (item.isWorking ? 'operation_confirmed' : 'not_tested'));
  const applicableStatuses = workingStatuses.filter((status) => status !== 'not_applicable');
  const isWorking = applicableStatuses.length === 0 || applicableStatuses.some((status) => status === 'not_tested')
    ? null
    : applicableStatuses.every((status) => status === 'operation_confirmed');

  return {
    isClean: items.every((item) => item.isClean),
    isUndamaged: items.every((item) => item.isUndamaged),
    isWorking,
  };
};

export const formatChecklistValue = (value: boolean | null): string => {
  if (value === null) {
    return '';
  }

  return value ? 'Y' : 'N';
};
