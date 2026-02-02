#!/usr/bin/env node

/**
 * Validate host.json schema for Azure Functions v2+
 * 
 * Ensures:
 * 1. extensions.http.routePrefix exists (correct schema)
 * 2. Top-level http block does NOT exist (old/invalid schema)
 * 
 * Exit codes:
 * 0 - Valid
 * 1 - Invalid schema
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const HOST_JSON_PATH = resolve(process.cwd(), 'host.json');

try {
  const content = readFileSync(HOST_JSON_PATH, 'utf8');
  const hostConfig = JSON.parse(content);

  let hasErrors = false;

  // Check 1: Ensure extensions.http.routePrefix exists
  if (!hostConfig.extensions?.http?.routePrefix) {
    console.error('❌ ERROR: host.json missing extensions.http.routePrefix');
    console.error('   Expected: extensions.http.routePrefix to be defined');
    console.error('   This is required for Azure Functions v2+ HTTP routing');
    hasErrors = true;
  } else {
    console.log('✅ extensions.http.routePrefix found:', hostConfig.extensions.http.routePrefix);
  }

  // Check 2: Ensure top-level http block does NOT exist
  if (hostConfig.http) {
    console.error('❌ ERROR: host.json contains top-level "http" block');
    console.error('   This is the old/invalid schema for Azure Functions v2+');
    console.error('   HTTP settings must be under "extensions.http", not at top-level');
    hasErrors = true;
  } else {
    console.log('✅ No top-level "http" block (correct)');
  }

  if (hasErrors) {
    console.error('\n❌ host.json validation FAILED');
    console.error('   Please move HTTP settings to extensions.http');
    process.exit(1);
  }

  console.log('\n✅ host.json validation PASSED');
  process.exit(0);

} catch (error) {
  console.error('❌ ERROR: Failed to read or parse host.json');
  console.error(error.message);
  process.exit(1);
}
