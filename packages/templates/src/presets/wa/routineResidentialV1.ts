import { publishTemplate } from '../../index.js';
import { waTemplate } from './shared.js';

export const waRoutineResidentialV1 = publishTemplate(waTemplate({
  id: 'wa-residential-routine', inspectionType: 'routine', status: 'draft', publishedAt: undefined,
}), '2026-07-22T00:00:00.000Z');
