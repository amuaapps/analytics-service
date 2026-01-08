import type { Config, ServiceConfig, SecurityConfig } from './types.js';
import {
  getRequiredEnvVar,
  getOptionalEnvVar,
  validateEnvironment,
  validateLogLevel,
  parseCorsOrigins,
  ConfigurationError,
} from './env-loader.js';
import { loadLimitsConfig } from './limits.js';
import { detectCloudProvider, loadAwsConfig, loadAzureConfig } from './cloud.js';

function loadServiceConfig(): ServiceConfig {
  const nodeEnv = getOptionalEnvVar('NODE_ENV', 'development') ?? 'development';
  const env = validateEnvironment(nodeEnv);

  const logLevelStr = getOptionalEnvVar('LOG_LEVEL', env === 'prod' ? 'info' : 'debug') ?? (env === 'prod' ? 'info' : 'debug');
  const logLevel = validateLogLevel(logLevelStr);

  return {
    serviceName: 'analytics-service',
    env,
    logLevel,
  };
}

function loadSecurityConfig(): SecurityConfig {
  const analyticsWriteKey = getRequiredEnvVar('ANALYTICS_WRITE_KEY');

  const corsOriginsEnvValue = process.env.CORS_ALLOWED_ORIGINS;
  if (corsOriginsEnvValue !== undefined && corsOriginsEnvValue.trim() === '') {
    throw new ConfigurationError('CORS_ALLOWED_ORIGINS must not be empty');
  }

  const corsOriginsStr = getOptionalEnvVar('CORS_ALLOWED_ORIGINS', '*');
  const corsAllowedOrigins = corsOriginsStr === '*' ? ['*'] : parseCorsOrigins(corsOriginsStr);

  if (corsAllowedOrigins.length === 0) {
    throw new ConfigurationError('CORS_ALLOWED_ORIGINS must not be empty');
  }

  return {
    analyticsWriteKey,
    corsAllowedOrigins,
  };
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const service = loadServiceConfig();
  const security = loadSecurityConfig();
  const limits = loadLimitsConfig();

  const cloudProvider = detectCloudProvider();

  const config: Config = {
    service,
    security,
    limits,
    cloudProvider,
  };

  if (cloudProvider === 'aws') {
    config.aws = loadAwsConfig();
  } else if (cloudProvider === 'azure') {
    config.azure = loadAzureConfig();
  }

  cachedConfig = config;
  return config;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export { ConfigurationError } from './env-loader.js';
