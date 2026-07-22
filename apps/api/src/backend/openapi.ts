import { API_ROUTE_NAMES, ROUTE_POLICIES } from './routeCatalog.js';

function operation(resource: string, method: 'get' | 'post' | 'patch' | 'put', collection: boolean) {
  const policy = ROUTE_POLICIES[resource];
  if (!policy) throw new Error(`Missing route policy for ${resource}.`);
  return {
    operationId: `${method}${resource.replace(/-([a-z])/gu, (_match: string, letter: string) => letter.toUpperCase())}${collection ? 'Collection' : 'Record'}`,
    tags: [resource],
    security: [{ bearerAuth: [], appCheck: [], agency: [] }],
    parameters: [
      { name: 'x-agency-id', in: 'header', required: true, schema: { type: 'string' } },
      ...(!collection ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] : []),
      ...(method !== 'get' ? [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 200 } }] : []),
    ],
    ...(method !== 'get' ? { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } } : {}),
    responses: {
      [method === 'post' ? '201' : '200']: { description: 'Successful response' },
      '400': { $ref: '#/components/responses/Error' },
      '401': { $ref: '#/components/responses/Error' },
      '403': { $ref: '#/components/responses/Error' },
      '409': { $ref: '#/components/responses/Error' },
      '413': { $ref: '#/components/responses/Error' },
      '429': { $ref: '#/components/responses/Error' },
    },
    'x-required-capability': method === 'get' ? policy.readCapability : policy.writeCapability,
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, unknown> = {};
  for (const resource of API_ROUTE_NAMES) {
    const policy = ROUTE_POLICIES[resource];
    if (!policy) continue;
    paths[`/api/v1/${resource}`] = {
      get: operation(resource, 'get', true),
      ...(policy.writeCapability ? { post: operation(resource, 'post', true) } : {}),
    };
    paths[`/api/v1/${resource}/{id}`] = {
      get: operation(resource, 'get', false),
      ...(policy.writeCapability ? { patch: operation(resource, 'patch', false) } : {}),
    };
  }

  paths['/api/v1/inspection-jobs/{id}/transitions'] = {
    post: {
      ...operation('inspection-jobs', 'post', false),
      operationId: 'transitionInspectionJob',
      responses: { '200': { description: 'Workflow transition completed' }, '409': { $ref: '#/components/responses/Error' } },
    },
  };
  paths['/api/v1/inspection-jobs/commands/book'] = {
    post: { ...operation('inspection-jobs', 'post', true), operationId: 'bookInspectionJob', description: 'Materialises a published template, job, immutable assignment, report workspace, audit event and outbox event as a recoverable idempotent booking saga.' },
  };
  paths['/api/v1/reports/{id}/aggregate'] = {
    get: {
      ...operation('reports', 'get', false),
      operationId: 'getReportAggregate',
      responses: { '200': { description: 'Decomposed report metadata, areas and components' }, '404': { $ref: '#/components/responses/Error' } },
    },
    put: {
      ...operation('reports', 'put', false),
      operationId: 'saveReportAggregate',
      description: 'Deprecated migration-only endpoint. Atomically creates or replaces editable report metadata, areas and components. Binary media is rejected.',
      deprecated: true,
      responses: {
        '200': { description: 'Existing aggregate updated' },
        '201': { description: 'Aggregate created' },
        '400': { $ref: '#/components/responses/Error' },
        '409': { $ref: '#/components/responses/Error' },
        '413': { $ref: '#/components/responses/Error' },
      },
    },
  };
  paths['/api/v1/reports/{id}/transitions'] = {
    post: {
      ...operation('reports', 'post', false),
      operationId: 'transitionReport',
      deprecated: true,
      description: 'Disabled. Use a named command under /commands/{command}.',
      responses: { '410': { $ref: '#/components/responses/Error' } },
    },
  };
  paths['/api/v1/reports/{id}/workspace'] = {
    get: { ...operation('reports', 'get', false), operationId: 'getReportWorkspace', description: 'Loads canonical report metadata, area and component records with entity versions.' },
  };
  paths['/api/v1/reports/{id}/metadata'] = {
    patch: { ...operation('reports', 'patch', false), operationId: 'patchReportMetadata', description: 'Updates editable report metadata using report-level optimistic concurrency.' },
  };
  paths['/api/v1/reports/{id}/areas'] = {
    post: { ...operation('reports', 'post', false), operationId: 'createReportArea', description: 'Creates one draft report area and increments the workspace revision.' },
  };
  paths['/api/v1/reports/{id}/areas/{areaId}'] = {
    patch: { ...operation('reports', 'patch', false), operationId: 'patchReportArea', description: 'Updates one area using its entity version.' },
    delete: { ...operation('reports', 'patch', false), operationId: 'deleteReportArea', description: 'Deletes one editable area and its component records.' },
  };
  paths['/api/v1/reports/{id}/areas/{areaId}/components'] = {
    post: { ...operation('reports', 'post', false), operationId: 'createReportComponent', description: 'Creates one structured component assessment.' },
  };
  paths['/api/v1/reports/{id}/areas/{areaId}/components/{componentId}'] = {
    patch: { ...operation('reports', 'patch', false), operationId: 'patchReportComponent', description: 'Updates one component using component-level optimistic concurrency.' },
  };
  paths['/api/v1/reports/{id}/commands/{command}'] = {
    post: { ...operation('reports', 'post', false), operationId: 'executeNamedReportCommand', description: 'Runs a server-authoritative named workflow command with persisted quality gates.' },
  };
  paths['/api/v1/reports/{id}/quality-runs'] = {
    post: { ...operation('reports', 'post', false), operationId: 'runReportQuality', description: 'Runs deterministic server-side readiness checks for a workflow stage.' },
  };
  paths['/api/v1/reports/{id}/quality-runs/latest'] = {
    get: { ...operation('reports', 'get', false), operationId: 'getLatestReportQuality', description: 'Returns the quality run bound to the current workspace revision.' },
  };
  paths['/api/v1/reports/{id}/quality-runs/{runId}/waivers'] = {
    post: { ...operation('reports', 'post', false), operationId: 'waiveReportQualityFinding', description: 'Records an authorised, reasoned waiver for an eligible quality finding.' },
  };
  paths['/api/v1/reports/{id}/review-rounds'] = {
    get: { ...operation('reports', 'get', false), operationId: 'listReviewRounds' },
    post: { ...operation('reports', 'post', false), operationId: 'startReviewRound', description: 'Starts a review round bound to an exact workspace revision.' },
  };
  paths['/api/v1/reports/{id}/review-comments'] = {
    get: { ...operation('reports', 'get', false), operationId: 'listReviewComments' },
    post: { ...operation('reports', 'post', false), operationId: 'createReviewComment', description: 'Creates a structured, evidence-linkable review comment.' },
  };
  paths['/api/v1/reports/{id}/review-comments/{commentId}'] = {
    patch: { ...operation('reports', 'patch', false), operationId: 'updateReviewComment', description: 'Updates or resolves one review comment with optimistic concurrency.' },
  };
  paths['/api/v1/uploads/{id}/complete'] = {
    post: { ...operation('uploads', 'post', false), operationId: 'completeEvidenceUpload', description: 'Verifies the immutable Storage generation and creates evidence metadata.' },
  };
  for (const resource of ['import-jobs', 'deliveries', 'maintenance-items', 'comparison-runs', 'service-orders', 'field-attendances', 'evidence-packs', 'portfolio-audits']) {
    paths[`/api/v1/${resource}/{id}/commands/{command}`] = {
      post: { ...operation(resource, 'post', false), operationId: `execute${resource.replace(/(^|-)([a-z])/gu, (_match: string, _dash: string, letter: string) => letter.toUpperCase())}Command`, description: 'Executes a guarded, idempotent named lifecycle command and writes audit and outbox records.' },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Property Condition Report API',
      version: '1.2.0',
      description: 'Server-authoritative Cloud Run API for agency-scoped property inspection operations.',
    },
    servers: [{ url: '/', description: 'Current Cloud Run service' }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' },
        appCheck: { type: 'apiKey', in: 'header', name: 'X-Firebase-AppCheck' },
        agency: { type: 'apiKey', in: 'header', name: 'X-Agency-Id' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status', 'correlationId'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                status: { type: 'integer' },
                correlationId: { type: 'string' },
                details: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      responses: {
        Error: { description: 'Consistent API error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  };
}
