export { waEntryResidentialV1 } from './entryResidentialV1.js';
export { waRoutineResidentialV1 } from './routineResidentialV1.js';
export { waExitResidentialV1 } from './exitResidentialV1.js';

import { waEntryResidentialV1 } from './entryResidentialV1.js';
import { waRoutineResidentialV1 } from './routineResidentialV1.js';
import { waExitResidentialV1 } from './exitResidentialV1.js';

export const WA_RESIDENTIAL_V1_TEMPLATES = [waEntryResidentialV1, waRoutineResidentialV1, waExitResidentialV1] as const;
