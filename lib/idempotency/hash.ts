import { createHash } from 'crypto';

/**
 * Recursively canonicalizes an object by sorting its keys alphabetically.
 * Ensures consistent serialization regardless of JSON key ordering.
 */
function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return typeof val === 'bigint' ? val.toString() : val;
  }

  if (Array.isArray(val)) {
    return val.map(canonicalize);
  }

  const record = val as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(record[key]);
  }
  return result;
}

/**
 * Computes a deterministic SHA-256 hash of a request body.
 */
export function computeRequestHash(payload: unknown): string {
  const normalized = canonicalize(payload);
  const serialized = JSON.stringify(normalized);
  return createHash('sha256').update(serialized).digest('hex');
}
