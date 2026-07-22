import { publishTemplate } from '../../index.js';
import { waTemplate } from './shared.js';

export const waExitResidentialV1 = publishTemplate(waTemplate({
  id: 'wa-residential-exit', inspectionType: 'exit', status: 'draft', publishedAt: undefined,
}), '2026-07-22T00:00:00.000Z');
