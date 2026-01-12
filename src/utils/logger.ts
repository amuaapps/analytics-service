import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';
import type { LogLevel } from '../config/types.js';

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  eventId?: string;
  batchId?: string;
  userId?: string;
  appId?: string;
  [key: string]: unknown;
}

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'session',
  'apiKey',
  'api_key',
  'writeKey',
  'write_key',
  'analyticsWriteKey',
  'analytics_write_key',
];

const PII_FIELDS = [
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'ssn',
  'creditCard',
  'credit_card',
  'address',
  'ipAddress',
  'ip_address',
  'ip',
];

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()));
    const isPII = PII_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()));

    if (isSensitive || isPII) {
      sanitized[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item): unknown => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return sanitizeObject(item as Record<string, unknown>);
        }
        return item;
      });
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function sanitizeLogContext(context: LogContext): LogContext {
  return sanitizeObject(context) as LogContext;
}

function mapLogLevel(level: LogLevel): pino.Level {
  const levelMap: Record<LogLevel, pino.Level> = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
  };
  return levelMap[level];
}

export interface CreateLoggerOptions {
  serviceName: string;
  level: LogLevel;
  env: string;
}

export function createLogger(options: CreateLoggerOptions): PinoLogger {
  const { serviceName, level, env } = options;

  const isDevelopment = env === 'dev';

  const pinoConfig: pino.LoggerOptions = {
    level: mapLogLevel(level),
    base: {
      serviceName,
      env,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  // Note: pino-pretty is optional and only used in local development
  // Skip in test/CI environments to avoid transport errors
  if (isDevelopment && !process.env.CI && process.env.NODE_ENV !== 'test') {
    try {
      pinoConfig.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      };
    } catch {
      // pino-pretty not available, use default JSON formatting
    }
  }

  return pino(pinoConfig);
}

export function createChildLogger(parentLogger: PinoLogger, context: LogContext): PinoLogger {
  const sanitizedContext = sanitizeLogContext(context);
  return parentLogger.child(sanitizedContext);
}

export type Logger = PinoLogger;
