export type ShellOperationKind = 'save' | 'sync' | 'upload' | 'analysis' | 'pdf' | 'load';
export type ShellOperationStatus = 'started' | 'succeeded' | 'failed';
export type PersistenceMode = 'local' | 'cloud';

export interface ShellOperationDetail {
  id: string;
  kind: ShellOperationKind;
  status: ShellOperationStatus;
  title: string;
  message?: string;
  source?: string;
  persistence?: PersistenceMode;
  recordVersion?: number;
  entityType?: string;
  entityId?: string;
  action?: string;
  dirtyScopeId?: string;
  correlationId?: string;
  errorCode?: string;
  httpStatus?: number;
  retryable?: boolean;
  attempt?: number;
  clearDirty?: boolean;
  announceSuccess?: boolean;
  occurredAt: string;
}

const SHELL_OPERATION_EVENT = 'proinspect:shell-operation';

export const createShellOperationId = (prefix: string): string => {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
};

export const emitShellOperation = (
  detail: Omit<ShellOperationDetail, 'occurredAt'> & { occurredAt?: string },
): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ShellOperationDetail>(SHELL_OPERATION_EVENT, {
    detail: { ...detail, occurredAt: detail.occurredAt ?? new Date().toISOString() },
  }));
};

export const subscribeToShellOperations = (
  listener: (detail: ShellOperationDetail) => void,
): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<ShellOperationDetail>).detail);
  window.addEventListener(SHELL_OPERATION_EVENT, handler);
  return () => window.removeEventListener(SHELL_OPERATION_EVENT, handler);
};

export const classifyOperationalFailure = (message: string): ShellOperationKind => {
  const normalized = message.toLowerCase();
  if (/pdf|print|render/.test(normalized)) return 'pdf';
  if (/upload|photo|image|heic|file/.test(normalized)) return 'upload';
  if (/\bai\b|analysis|gemini|model|quota/.test(normalized)) return 'analysis';
  if (/save|saved|saving|persist|storage/.test(normalized)) return 'save';
  if (/sync|cloud|firebase|network|offline|api/.test(normalized)) return 'sync';
  return 'save';
};
