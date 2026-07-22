import {
  createShellOperationId,
  emitShellOperation,
  type PersistenceMode,
  type ShellOperationDetail,
  type ShellOperationKind,
} from './shellEvents';

export interface OperationOptions {
  kind: ShellOperationKind;
  title: string;
  source: string;
  persistence?: PersistenceMode;
  dirtyScopeId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  correlationId?: string;
  announceSuccess?: boolean;
  attempt?: number;
}

interface OperationalError extends Error {
  code?: string;
  status?: number;
  correlationId?: string;
  retryable?: boolean;
}

export const getOperationalErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The operation did not complete. Review the record and try again.';
};

export const getOperationalErrorDetail = (error: unknown): Pick<ShellOperationDetail, 'correlationId' | 'errorCode' | 'httpStatus' | 'retryable'> => {
  const candidate = error as Partial<OperationalError> | null;
  const httpStatus = typeof candidate?.status === 'number' ? candidate.status : undefined;
  return {
    ...(candidate?.correlationId ? { correlationId: candidate.correlationId } : {}),
    ...(candidate?.code ? { errorCode: candidate.code } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    retryable: candidate?.retryable ?? (httpStatus === undefined || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500),
  };
};

export async function runShellOperation<T>(
  options: OperationOptions,
  action: () => Promise<T>,
): Promise<T> {
  const id = createShellOperationId(options.kind);
  emitShellOperation({ ...options, id, status: 'started' });

  try {
    const result = await action();
    emitShellOperation({
      ...options,
      id,
      status: 'succeeded',
      clearDirty: Boolean(options.dirtyScopeId),
    });
    return result;
  } catch (error) {
    emitShellOperation({
      ...options,
      ...getOperationalErrorDetail(error),
      id,
      status: 'failed',
      message: getOperationalErrorMessage(error),
    });
    throw error;
  }
}
