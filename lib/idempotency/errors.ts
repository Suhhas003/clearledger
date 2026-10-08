/**
 * Idempotency Error Definitions
 */

export class IdempotencyConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(message: string = 'A request with this idempotency key is currently being processed.') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyPayloadMismatchError extends Error {
  public readonly statusCode = 422;
  public readonly code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';

  constructor(
    message: string = 'The idempotency key was previously submitted with a different request payload.'
  ) {
    super(message);
    this.name = 'IdempotencyPayloadMismatchError';
  }
}

export class IdempotencyKeyExpiredError extends Error {
  public readonly statusCode = 400;
  public readonly code = 'IDEMPOTENCY_KEY_EXPIRED';

  constructor(message: string = 'The provided idempotency key has expired.') {
    super(message);
    this.name = 'IdempotencyKeyExpiredError';
  }
}
