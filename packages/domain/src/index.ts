export * from './platform.js';
export * from './security.js';
export * from './reportModel.js';
export * from './photoEvidence.js';
export * from './workflow.js';
export * from './operations.js';
export * from './serviceRecords.js';
export * from './serviceWorkflow.js';
export * from './commercialRules.js';

export interface DomainErrorShape {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  correlationId?: string;
}
