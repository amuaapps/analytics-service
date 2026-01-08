import { randomUUID } from 'crypto';

export function generateRequestId(): string {
  return randomUUID();
}

export function generateBatchId(): string {
  return randomUUID();
}

export function extractRequestIdFromHeader(headerValue: string | undefined): string | undefined {
  if (!headerValue || typeof headerValue !== 'string') {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

export function getOrGenerateRequestId(headerValue: string | undefined): string {
  return extractRequestIdFromHeader(headerValue) ?? generateRequestId();
}

export interface CorrelationContext {
  requestId: string;
  batchId?: string;
  eventIds?: string[];
}

export function createCorrelationContext(requestId: string): CorrelationContext {
  return {
    requestId,
  };
}

export function addBatchIdToContext(
  context: CorrelationContext,
  batchId: string
): CorrelationContext {
  return {
    ...context,
    batchId,
  };
}

export function addEventIdsToContext(
  context: CorrelationContext,
  eventIds: string[]
): CorrelationContext {
  return {
    ...context,
    eventIds,
  };
}
