import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthorisationTarget, DomainErrorShape, SecurityCapability } from '@pcr/domain';
import { ApiError, routeApiRequest, type ApiResponse } from './backend/router.js';
import { routeReportAggregateRequest } from './backend/reportRoutes.js';
import { routeExceptionalReportRequest } from './backend/exceptionalReportRoutes.js';
import { routeBatchOneReportRequest } from './backend/reportBatch1Routes.js';
import { routeBatchThreeRequest } from './backend/batch3Routes.js';
import { routeInspectionJobCommandRequest } from './backend/inspectionJobCommandRoutes.js';
import { routeTemplateLibraryRequest } from './backend/templateLibraryRoutes.js';
import { routeAdministrationRequest } from './backend/administrationRoutes.js';
import { buildOpenApiDocument } from './backend/openapi.js';
import type { ApiDependencies } from './backend/types.js';
import { authenticateAndAuthorise, SecurityError } from './security/authoriseRequest.js';
import { createSecurityDependencies } from './security/defaultDependencies.js';
import { SlidingWindowRateLimiter } from './security/rateLimit.js';

const limiter = new SlidingWindowRateLimiter();

function send(res: ServerResponse, response: ApiResponse, correlationId: string): void {
  res.writeHead(response.status, {
    'content-type': 'application/json',
    'x-correlation-id': correlationId,
    'cache-control': 'no-store',
    ...response.headers,
  });
  res.end(JSON.stringify(response.body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function errorResponse(error: unknown, correlationId: string): ApiResponse {
  if (error instanceof SecurityError || error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          status: error.status,
          correlationId,
          ...('details' in error && error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown; details?: unknown };
    if (typeof candidate.status === 'number' && typeof candidate.code === 'string') {
      return {
        status: candidate.status,
        body: {
          error: {
            code: candidate.code,
            message: typeof candidate.message === 'string' ? candidate.message : 'The request could not be completed.',
            status: candidate.status,
            correlationId,
            ...(candidate.details && typeof candidate.details === 'object' ? { details: candidate.details } : {}),
          },
        },
      };
    }
  }
  console.error(JSON.stringify({ level: 'error', message: 'api.unhandled_error', correlationId, error: error instanceof Error ? error.message : String(error) }));
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.', status: 500, correlationId } };
}

function resourcePath(urlValue: string | undefined, resource: string): string[] | undefined {
  const parts = new URL(urlValue ?? '/', 'http://localhost').pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'v1' || parts[2] !== resource) return undefined;
  return parts.slice(3);
}

function agencyId(req: IncomingMessage): string {
  const value = req.headers['x-agency-id']?.toString().trim();
  if (!value) throw new ApiError(400, 'AGENCY_HEADER_REQUIRED', 'x-agency-id is required.');
  return value;
}

export function createRequestHandler(dependencies: ApiDependencies = createSecurityDependencies()) {
  return async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const correlationId = req.headers['x-correlation-id']?.toString() ?? randomUUID();
    const startedAt = Date.now();
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const entityId = requestUrl.pathname.split('/').filter(Boolean)[3];
    const sendResponse = (response: ApiResponse): void => {
      const body = response.body as { meta?: { actor?: string }; principal?: { uid?: string }; error?: { code?: string } };
      console.log(JSON.stringify({
        severity: response.status >= 500 ? 'ERROR' : response.status >= 400 ? 'WARNING' : 'INFO',
        correlationId,
        agencyId: req.headers['x-agency-id']?.toString() ?? 'unresolved',
        actorId: body.meta?.actor ?? body.principal?.uid ?? 'unresolved',
        operation: `${req.method ?? 'UNKNOWN'} ${requestUrl.pathname}`,
        entityId: entityId ?? null,
        durationMs: Date.now() - startedAt,
        status: response.status,
        errorCode: body.error?.code ?? null,
      }));
      send(res, response, correlationId);
    };
    const rateKey = `${req.socket.remoteAddress ?? 'unknown'}:${req.url ?? '/'}`;
    if (!limiter.consume(rateKey)) {
      sendResponse({ status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many requests.', status: 429, correlationId } } });
      return;
    }

    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendResponse({ status: 200, body: { status: 'ok', service: 'pcr-api', version: 'v1', correlationId } });
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/openapi.json') {
        sendResponse({ status: 200, body: buildOpenApiDocument() });
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/security/authorise') {
        const body = await readJson(req);
        const capability = body.capability as SecurityCapability;
        const target = body.target as AuthorisationTarget;
        const principal = await authenticateAndAuthorise(req, dependencies, capability, target, correlationId);
        sendResponse({ status: 200, body: { principal: { uid: principal.uid, agencyId: principal.agencyId, role: principal.role }, allowed: true } });
        return;
      }

      const administrationPath = resourcePath(req.url, 'administration');
      if (administrationPath) {
        const response = await routeAdministrationRequest(req, dependencies, correlationId, agencyId(req), administrationPath);
        if (response) {
          sendResponse(response);
          return;
        }
      }

      const templatePath = resourcePath(req.url, 'template-library');
      if (templatePath) {
        const response = await routeTemplateLibraryRequest(req, dependencies, correlationId, agencyId(req), templatePath);
        if (response) {
          sendResponse(response);
          return;
        }
      }

      const jobPath = resourcePath(req.url, 'inspection-jobs');
      if (jobPath) {
        const response = await routeInspectionJobCommandRequest(req, dependencies, correlationId, agencyId(req), jobPath);
        if (response) {
          sendResponse(response);
          return;
        }
      }

      const reportPath = resourcePath(req.url, 'reports');
      if (reportPath) {
        if (req.method === 'POST' && reportPath.length === 0) throw new ApiError(410, 'GENERIC_REPORT_CREATION_DISABLED', 'Book an inspection or use a controlled report command.');
        const exceptionalResponse = await routeExceptionalReportRequest(req, dependencies, correlationId, agencyId(req), reportPath);
        if (exceptionalResponse) {
          sendResponse(exceptionalResponse);
          return;
        }
        const reportId = reportPath[0];
        const nested = reportPath.slice(1);
        const batchOneResponse = await routeBatchOneReportRequest(req, dependencies, correlationId, agencyId(req), reportId, nested);
        if (batchOneResponse) {
          sendResponse(batchOneResponse);
          return;
        }
        const reportResponse = await routeReportAggregateRequest(req, dependencies, correlationId, agencyId(req), reportId, nested);
        if (reportResponse) {
          sendResponse(reportResponse);
          return;
        }
      }

      for (const resource of ['evidence-packs', 'portfolio-audits', 'branding-versions']) {
        const path = resourcePath(req.url, resource);
        if (!path) continue;
        const response = await routeBatchThreeRequest(req, dependencies, correlationId, agencyId(req), resource, path[0], path.slice(1));
        if (response) {
          sendResponse(response);
          return;
        }
      }

      const routed = await routeApiRequest(req, res, dependencies, correlationId);
      if (routed) {
        sendResponse(routed);
        return;
      }

      const error: DomainErrorShape = { code: 'NOT_FOUND', message: 'Route not found.', status: 404, correlationId };
      sendResponse({ status: 404, body: { error } });
    } catch (error) {
      sendResponse(errorResponse(error, correlationId));
    }
  };
}

export const requestHandler = createRequestHandler();
