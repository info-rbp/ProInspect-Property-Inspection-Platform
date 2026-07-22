import { publishTemplate } from '../../index.js';
import { waTemplate } from './shared.js';

export const waEntryResidentialV1 = publishTemplate(waTemplate({
  id: 'wa-residential-entry-pcr', inspectionType: 'entry', status: 'draft', publishedAt: undefined,
}), '2026-07-22T00:00:00.000Z');
