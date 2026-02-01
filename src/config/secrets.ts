import { getOptionalEnvVar } from './env-loader.js';
import type { CloudProvider } from './types.js';

/**
 * Secret cache to avoid repeated API calls.
 * Secrets are cached for the lifetime of the Lambda/Function instance
 */
const secretCache = new Map<string, string>();

/**
 * Fetch secret from AWS Secrets Manager
 */
async function fetchAwsSecret(secretArn: string): Promise<string> {
  // Check cache first
  if (secretCache.has(secretArn)) {
    return secretCache.get(secretArn)!;
  }

  // Lazy load AWS SDK to avoid cold start penalty when not needed
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import('@aws-sdk/client-secrets-manager');

  const client = new SecretsManagerClient({});
  const command = new GetSecretValueCommand({ SecretId: secretArn });

  try {
    const response = await client.send(command);
    const secretValue = response.SecretString;

    if (!secretValue) {
      throw new Error(`Secret ${secretArn} has no string value`);
    }

    // Cache the secret.
    secretCache.set(secretArn, secretValue);
    return secretValue;
  } catch (error) {
    throw new Error(
      `Failed to fetch secret from AWS Secrets Manager: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load analytics write key from cloud secret store
 *
 * AWS: Fetches from Secrets Manager using ARN from env var
 * Azure: Uses Key Vault reference (automatically resolved by Azure Functions runtime)
 *
 * @param cloudProvider - The cloud provider ('aws' or 'azure')
 * @returns The analytics write key
 */
export async function loadAnalyticsWriteKey(cloudProvider: CloudProvider): Promise<string> {
  if (cloudProvider === 'aws') {
    // AWS: Fetch from Secrets Manager
    const secretArn = getOptionalEnvVar('ANALYTICS_WRITE_KEY_SECRET_ARN');
    if (secretArn) {
      return fetchAwsSecret(secretArn);
    }

    // Fallback to direct env var for local development
    const directKey = getOptionalEnvVar('ANALYTICS_WRITE_KEY');
    if (directKey) {
      return directKey;
    }

    throw new Error(
      'Analytics write key not configured. Set ANALYTICS_WRITE_KEY_SECRET_ARN or ANALYTICS_WRITE_KEY'
    );
  }

  if (cloudProvider === 'azure') {
    // Azure: Key Vault reference is automatically resolved by Azure Functions runtime
    // The env var will contain the actual secret value, not the reference
    const writeKey = getOptionalEnvVar('ANALYTICS_WRITE_KEY');
    if (!writeKey) {
      throw new Error(
        'Analytics write key not configured. Ensure Key Vault reference is set in Function App settings'
      );
    }
    return writeKey;
  }

  throw new Error(`Unsupported cloud provider: ${cloudProvider}`);
}

/**
 * Clear the secret cache (useful for testing)
 */
export function clearSecretCache(): void {
  secretCache.clear();
}
