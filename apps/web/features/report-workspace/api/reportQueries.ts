import type { ReportAggregate } from '@pcr/domain';
import { apiRequest } from '../../../services/apiClient';

export const getReportWorkspace = (agencyId: string, reportId: string) =>
  apiRequest<ReportAggregate>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/workspace`);
