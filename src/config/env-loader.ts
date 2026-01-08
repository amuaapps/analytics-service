import type { Environment } from '../domain/base-types.js';
import type { LogLevel, CloudProvider } from './types.js';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new ConfigurationError(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

export function getOptionalEnvVar(key: string): string | undefined;
export function getOptionalEnvVar(key: string, defaultValue: string): string;
export function getOptionalEnvVar(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

export function getEnvVarAsInt(
  name: string, 
  defaultValue: number,
  options?: { min?: number; max?: number }
): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `Environment variable ${name} must be a valid integer, got: ${value}`
    );
  }

  if (options?.min !== undefined && parsed < options.min) {
    throw new ConfigurationError(
      `Environment variable ${name} must be >= ${options.min}, got: ${parsed}`
    );
  }

  if (options?.max !== undefined && parsed > options.max) {
    throw new ConfigurationError(
      `Environment variable ${name} cannot exceed ${options.max} (hard maximum), got: ${parsed}`
    );
  }

  return parsed;
}

export function getEnvVarAsBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new ConfigurationError(
    `Environment variable ${key} must be 'true' or 'false', got: ${value}`
  );
}

export function validateEnvironment(value: string): Environment {
  const validEnvironments: Environment[] = ['dev', 'staging', 'prod', 'test'];
  if (!validEnvironments.includes(value as Environment)) {
    throw new ConfigurationError(
      `NODE_ENV must be one of: ${validEnvironments.join(', ')}, got: ${value}`
    );
  }
  return value as Environment;
}

export function validateLogLevel(value: string): LogLevel {
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(value as LogLevel)) {
    throw new ConfigurationError(
      `LOG_LEVEL must be one of: ${validLevels.join(', ')}, got: ${value}`
    );
  }
  return value as LogLevel;
}

export function validateCloudProvider(value: string): CloudProvider {
  const validProviders: CloudProvider[] = ['aws', 'azure'];
  if (!validProviders.includes(value as CloudProvider)) {
    throw new ConfigurationError(
      `CLOUD_PROVIDER must be one of: ${validProviders.join(', ')}, got: ${value}`
    );
  }
  return value as CloudProvider;
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
