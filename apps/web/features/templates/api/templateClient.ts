import type { InspectionTypeTemplate } from '@pcr/templates';
import { apiRequest } from '../../../services/apiClient';

const path = (templateId: string, version: number) => `/api/v1/template-library/${encodeURIComponent(templateId)}/${version}`;

export const listTemplateLibrary = (agencyId: string) =>
  apiRequest<InspectionTypeTemplate[]>(agencyId, '/api/v1/template-library');

export const createTemplateDraft = (
  agencyId: string,
  input: { sourceTemplateId?: string; sourceTemplateVersion?: number; id?: string; version?: number; template?: InspectionTypeTemplate },
) => apiRequest<InspectionTypeTemplate>(agencyId, '/api/v1/template-library', {
  method: 'POST', body: input, entityType: 'template', action: 'create template draft', queueWhenOffline: false,
});

export const saveTemplateDraft = (agencyId: string, template: InspectionTypeTemplate) =>
  apiRequest<InspectionTypeTemplate>(agencyId, path(template.id, template.version), {
    method: 'PATCH', body: { template }, entityType: 'template', entityId: `${template.id}@${template.version}`, action: 'save template draft', queueWhenOffline: false,
  });

export const runTemplateCommand = (agencyId: string, template: Pick<InspectionTypeTemplate, 'id' | 'version'>, command: 'publish' | 'retire' | 'clone') =>
  apiRequest<InspectionTypeTemplate>(agencyId, `${path(template.id, template.version)}/commands/${command}`, {
    method: 'POST', body: {}, entityType: 'template', entityId: `${template.id}@${template.version}`, action: command, queueWhenOffline: false,
  });
