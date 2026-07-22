import type { ReportReviewComment, ReportReviewRound } from '@pcr/domain';
import { apiRequest } from '../../../services/apiClient';

export const listReviewRounds = (agencyId: string, reportId: string) =>
  apiRequest<ReportReviewRound[]>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/review-rounds`);

export const createReviewRound = (agencyId: string, reportId: string) =>
  apiRequest<ReportReviewRound>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/review-rounds`, {
    method: 'POST', body: {}, entityType: 'report', entityId: reportId, action: 'create review round', announceSuccess: true,
  });

export const listReviewComments = (agencyId: string, reportId: string) =>
  apiRequest<ReportReviewComment[]>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/review-comments`);

export const addReviewComment = (
  agencyId: string,
  reportId: string,
  input: Pick<ReportReviewComment, 'roundId' | 'body' | 'blocking' | 'areaId' | 'componentId' | 'evidenceId'>,
) => apiRequest<ReportReviewComment>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/review-comments`, {
  method: 'POST', body: input, entityType: 'report', entityId: reportId, action: 'add review comment', announceSuccess: true,
});

export const resolveReviewComment = (agencyId: string, reportId: string, comment: ReportReviewComment) =>
  apiRequest<ReportReviewComment>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/review-comments/${encodeURIComponent(comment.id)}`, {
    method: 'PATCH', body: { status: 'resolved', expectedVersion: comment.version }, baseVersion: comment.version,
    entityType: 'report', entityId: reportId, action: 'resolve review comment', announceSuccess: true,
  });
