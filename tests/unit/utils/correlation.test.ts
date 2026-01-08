import { describe, it, expect } from '@jest/globals';
import {
  generateRequestId,
  generateBatchId,
  extractRequestIdFromHeader,
  getOrGenerateRequestId,
  createCorrelationContext,
  addBatchIdToContext,
  addEventIdsToContext,
} from '../../../src/utils/correlation.js';

describe('Correlation Module', () => {
  describe('generateRequestId', () => {
    it('should generate a valid UUID', () => {
      const requestId = generateRequestId();

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      const id3 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe('generateBatchId', () => {
    it('should generate a valid UUID', () => {
      const batchId = generateBatchId();

      expect(batchId).toBeDefined();
      expect(typeof batchId).toBe('string');
      expect(batchId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = generateBatchId();
      const id2 = generateBatchId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('extractRequestIdFromHeader', () => {
    it('should extract valid UUID from header', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = extractRequestIdFromHeader(validUuid);

      expect(result).toBe(validUuid);
    });

    it('should extract valid UUID with whitespace', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = extractRequestIdFromHeader(`  ${validUuid}  `);

      expect(result).toBe(validUuid);
    });

    it('should return undefined for invalid UUID format', () => {
      const result = extractRequestIdFromHeader('not-a-uuid');

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const result = extractRequestIdFromHeader('');

      expect(result).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      const result = extractRequestIdFromHeader('   ');

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = extractRequestIdFromHeader(undefined);

      expect(result).toBeUndefined();
    });

    it('should handle uppercase UUIDs', () => {
      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = extractRequestIdFromHeader(validUuid);

      expect(result).toBe(validUuid);
    });

    it('should reject UUID with extra characters', () => {
      const result = extractRequestIdFromHeader('550e8400-e29b-41d4-a716-446655440000-extra');

      expect(result).toBeUndefined();
    });

    it('should reject partial UUID', () => {
      const result = extractRequestIdFromHeader('550e8400-e29b-41d4-a716');

      expect(result).toBeUndefined();
    });
  });

  describe('getOrGenerateRequestId', () => {
    it('should return existing valid UUID from header', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = getOrGenerateRequestId(validUuid);

      expect(result).toBe(validUuid);
    });

    it('should generate new UUID for invalid header', () => {
      const result = getOrGenerateRequestId('invalid');

      expect(result).toBeDefined();
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(result).not.toBe('invalid');
    });

    it('should generate new UUID for undefined header', () => {
      const result = getOrGenerateRequestId(undefined);

      expect(result).toBeDefined();
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should generate new UUID for empty header', () => {
      const result = getOrGenerateRequestId('');

      expect(result).toBeDefined();
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('createCorrelationContext', () => {
    it('should create context with request ID', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const context = createCorrelationContext(requestId);

      expect(context).toEqual({
        requestId,
      });
    });
  });

  describe('addBatchIdToContext', () => {
    it('should add batch ID to existing context', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const batchId = '660e8400-e29b-41d4-a716-446655440001';
      const context = createCorrelationContext(requestId);

      const updatedContext = addBatchIdToContext(context, batchId);

      expect(updatedContext).toEqual({
        requestId,
        batchId,
      });
    });

    it('should not mutate original context', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const batchId = '660e8400-e29b-41d4-a716-446655440001';
      const context = createCorrelationContext(requestId);

      const updatedContext = addBatchIdToContext(context, batchId);

      expect(context).toEqual({ requestId });
      expect(updatedContext).not.toBe(context);
    });
  });

  describe('addEventIdsToContext', () => {
    it('should add event IDs to existing context', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const eventIds = [
        '770e8400-e29b-41d4-a716-446655440002',
        '880e8400-e29b-41d4-a716-446655440003',
      ];
      const context = createCorrelationContext(requestId);

      const updatedContext = addEventIdsToContext(context, eventIds);

      expect(updatedContext).toEqual({
        requestId,
        eventIds,
      });
    });

    it('should not mutate original context', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const eventIds = ['770e8400-e29b-41d4-a716-446655440002'];
      const context = createCorrelationContext(requestId);

      const updatedContext = addEventIdsToContext(context, eventIds);

      expect(context).toEqual({ requestId });
      expect(updatedContext).not.toBe(context);
    });

    it('should handle empty event IDs array', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const context = createCorrelationContext(requestId);

      const updatedContext = addEventIdsToContext(context, []);

      expect(updatedContext).toEqual({
        requestId,
        eventIds: [],
      });
    });
  });

  describe('correlation context chaining', () => {
    it('should support chaining context updates', () => {
      const requestId = generateRequestId();
      const batchId = generateBatchId();
      const eventIds = [generateRequestId(), generateRequestId()];

      let context = createCorrelationContext(requestId);
      context = addBatchIdToContext(context, batchId);
      context = addEventIdsToContext(context, eventIds);

      expect(context).toEqual({
        requestId,
        batchId,
        eventIds,
      });
    });
  });
});
