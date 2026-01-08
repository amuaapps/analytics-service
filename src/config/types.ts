export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Environment = 'dev' | 'staging' | 'prod' | 'test';

export interface ServiceConfig {
  serviceName: string;
  env: Environment;
  logLevel: LogLevel;
}

export interface SecurityConfig {
  analyticsWriteKey: string;
  corsAllowedOrigins: string[];
}

export interface LimitsConfig {
  maxEventsPerBatch: number;
  minEventsPerBatch: number;
  maxPropertyDepth: number;
  maxKeysPerLevel: number;
  maxStringLength: number;
  maxArrayLength: number;
  maxPayloadSizeBytes: number;
  maxQueryWindowDays: number;
  defaultQueryLimit: number;
  maxQueryLimit: number;
}

export interface AwsConfig {
  region: string;
  dynamoDbTableName: string;
  s3RawBucketName: string;
  sqsQueueUrl: string;
}

export interface AzureConfig {
  cosmosEndpoint: string;
  cosmosKey: string;
  storageConnectionString: string;
  queueName: string;
}

export type CloudProvider = 'aws' | 'azure';

export interface Config {
  service: ServiceConfig;
  security: SecurityConfig;
  limits: LimitsConfig;
  cloudProvider?: CloudProvider;
  aws?: AwsConfig;
  azure?: AzureConfig;
}
