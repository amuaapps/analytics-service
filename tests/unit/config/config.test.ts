import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { loadConfig, resetConfigCache, ConfigurationError } from '../../../src/config/index.js';

describe('Configuration Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'dev';
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigCache();
  });

  describe('loadConfig', () => {
    it('should load valid configuration with all required env vars', () => {
      process.env.NODE_ENV = 'prod';
      process.env.LOG_LEVEL = 'info';
      process.env.ANALYTICS_WRITE_KEY = 'test-write-key-123';
      process.env.CORS_ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';
      process.env.CLOUD_PROVIDER = 'aws';
      process.env.AWS_REGION = 'us-east-1';
      process.env.DYNAMODB_TABLE_NAME = 'analytics_events';
      process.env.S3_RAW_BUCKET_NAME = 'analytics-raw-events';
      process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/queue';

      const config = loadConfig();

      expect(config.service.serviceName).toBe('analytics-service');
      expect(config.service.env).toBe('prod');
      expect(config.service.logLevel).toBe('info');
      expect(config.security.analyticsWriteKey).toBe('test-write-key-123');
      expect(config.security.corsAllowedOrigins).toEqual([
        'https://example.com',
        'https://app.example.com',
      ]);
      expect(config.cloudProvider).toBe('aws');
      expect(config.aws).toBeDefined();
      expect(config.aws?.region).toBe('us-east-1');
      expect(config.aws?.dynamoDbTableName).toBe('analytics_events');
    });

    it('should use default values for optional env vars', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config = loadConfig();

      expect(config.service.env).toBe('dev');
      expect(config.service.logLevel).toBe('debug');
      expect(config.security.corsAllowedOrigins).toEqual(['*']);
      expect(config.limits.maxEventsPerBatch).toBe(50);
      expect(config.limits.maxQueryLimit).toBe(200);
    });

    it('should throw ConfigurationError when required env var is missing', () => {
      delete process.env.ANALYTICS_WRITE_KEY;

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('Missing required environment variable: ANALYTICS_WRITE_KEY');
    });

    it('should validate NODE_ENV values', () => {
      process.env.NODE_ENV = 'invalid';
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('NODE_ENV must be one of: dev, staging, prod');
    });

    it('should validate LOG_LEVEL values', () => {
      process.env.LOG_LEVEL = 'invalid';
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('LOG_LEVEL must be one of: debug, info, warn, error');
    });

    it('should cache configuration after first load', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config1 = loadConfig();
      process.env.ANALYTICS_WRITE_KEY = 'different-key';
      const config2 = loadConfig();

      expect(config1).toBe(config2);
      expect(config2.security.analyticsWriteKey).toBe('test-key');
    });

    it('should reset cache when resetConfigCache is called', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key-1';

      const config1 = loadConfig();
      resetConfigCache();

      process.env.ANALYTICS_WRITE_KEY = 'test-key-2';
      const config2 = loadConfig();

      expect(config1).not.toBe(config2);
      expect(config1.security.analyticsWriteKey).toBe('test-key-1');
      expect(config2.security.analyticsWriteKey).toBe('test-key-2');
    });
  });

  describe('Service Configuration', () => {
    it('should default to dev environment', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config = loadConfig();

      expect(config.service.env).toBe('dev');
    });

    it('should use debug log level for dev environment by default', () => {
      process.env.NODE_ENV = 'dev';
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config = loadConfig();

      expect(config.service.logLevel).toBe('debug');
    });

    it('should use info log level for prod environment by default', () => {
      process.env.NODE_ENV = 'prod';
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config = loadConfig();

      expect(config.service.logLevel).toBe('info');
    });
  });

  describe('Security Configuration', () => {
    it('should parse CORS origins from comma-separated string', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.CORS_ALLOWED_ORIGINS = 'https://example.com, https://app.example.com, https://admin.example.com';

      const config = loadConfig();

      expect(config.security.corsAllowedOrigins).toEqual([
        'https://example.com',
        'https://app.example.com',
        'https://admin.example.com',
      ]);
    });

    it('should handle wildcard CORS origin', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.CORS_ALLOWED_ORIGINS = '*';

      const config = loadConfig();

      expect(config.security.corsAllowedOrigins).toEqual(['*']);
    });

    it('should throw error for empty CORS origins', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.CORS_ALLOWED_ORIGINS = '   ';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('CORS_ALLOWED_ORIGINS must not be empty');
    });
  });

  describe('Limits Configuration', () => {
    it('should load default limits', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config = loadConfig();

      expect(config.limits.maxEventsPerBatch).toBe(50);
      expect(config.limits.minEventsPerBatch).toBe(1);
      expect(config.limits.maxPropertyDepth).toBe(3);
      expect(config.limits.maxKeysPerLevel).toBe(50);
      expect(config.limits.maxStringLength).toBe(2048);
      expect(config.limits.maxArrayLength).toBe(100);
      expect(config.limits.maxPayloadSizeBytes).toBe(32768);
      expect(config.limits.maxQueryWindowDays).toBe(31);
      expect(config.limits.defaultQueryLimit).toBe(50);
      expect(config.limits.maxQueryLimit).toBe(200);
    });

    it('should allow overriding limits via env vars', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.MAX_EVENTS_PER_BATCH = '100';
      process.env.MAX_QUERY_LIMIT = '500';

      const config = loadConfig();

      expect(config.limits.maxEventsPerBatch).toBe(100);
      expect(config.limits.maxQueryLimit).toBe(500);
    });

    it('should throw error for invalid integer env vars', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.MAX_EVENTS_PER_BATCH = 'not-a-number';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('MAX_EVENTS_PER_BATCH must be a valid integer');
    });
  });

  describe('Cloud Provider Configuration', () => {
    it('should detect AWS when AWS env vars are present', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.AWS_REGION = 'us-east-1';
      process.env.DYNAMODB_TABLE_NAME = 'analytics_events';
      process.env.S3_RAW_BUCKET_NAME = 'analytics-raw';
      process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/queue';

      const config = loadConfig();

      expect(config.cloudProvider).toBe('aws');
      expect(config.aws).toBeDefined();
      expect(config.azure).toBeUndefined();
    });

    it('should detect Azure when Azure env vars are present', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.AZURE_COSMOS_ENDPOINT = 'https://test.documents.azure.com:443/';
      process.env.AZURE_COSMOS_KEY = 'test-key';
      process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test';
      process.env.AZURE_QUEUE_NAME = 'analytics-events';

      const config = loadConfig();

      expect(config.cloudProvider).toBe('azure');
      expect(config.azure).toBeDefined();
      expect(config.aws).toBeUndefined();
    });

    it('should use explicit CLOUD_PROVIDER when set', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.CLOUD_PROVIDER = 'aws';
      process.env.AWS_REGION = 'us-east-1';
      process.env.DYNAMODB_TABLE_NAME = 'analytics_events';
      process.env.S3_RAW_BUCKET_NAME = 'analytics-raw';
      process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/queue';

      const config = loadConfig();

      expect(config.cloudProvider).toBe('aws');
    });

    it('should throw error when both AWS and Azure configs are present without explicit provider', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.AWS_REGION = 'us-east-1';
      process.env.DYNAMODB_TABLE_NAME = 'analytics_events';
      process.env.S3_RAW_BUCKET_NAME = 'analytics-raw';
      process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/queue';
      process.env.AZURE_COSMOS_ENDPOINT = 'https://test.documents.azure.com:443/';
      process.env.AZURE_COSMOS_KEY = 'test-key';
      process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test';
      process.env.AZURE_QUEUE_NAME = 'analytics-events';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('Both AWS and Azure configurations detected');
    });

    it('should allow no cloud provider for local development', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';

      const config = loadConfig();

      expect(config.cloudProvider).toBeUndefined();
      expect(config.aws).toBeUndefined();
      expect(config.azure).toBeUndefined();
    });

    it('should throw error when AWS is selected but required vars are missing', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.CLOUD_PROVIDER = 'aws';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('Missing required environment variable: AWS_REGION');
    });

    it('should throw error when Azure is selected but required vars are missing', () => {
      process.env.ANALYTICS_WRITE_KEY = 'test-key';
      process.env.CLOUD_PROVIDER = 'azure';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('Missing required environment variable: AZURE_COSMOS_ENDPOINT');
    });
  });
});
