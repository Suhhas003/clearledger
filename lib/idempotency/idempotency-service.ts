import { PrismaClient, Prisma, IdempotencyStatus, IdempotencyKey } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { computeRequestHash } from './hash';
import { IdempotencyCheckParams, IdempotencyResolution } from './types';
import {
  IdempotencyConflictError,
  IdempotencyPayloadMismatchError,
} from './errors';

export function stringifyWithBigInt(data: unknown): string {
  return JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

export class IdempotencyService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Evaluates or establishes an idempotency record for a request.
   *
   * 1. If key exists with COMPLETED:
   *    - If payload hash matches: returns cached response (isReplay: true).
   *    - If payload hash differs: throws IdempotencyPayloadMismatchError (422).
   * 2. If key exists with PENDING:
   *    - If payload hash differs: throws IdempotencyPayloadMismatchError (422).
   *    - If lock is still active: throws IdempotencyConflictError (409).
   * 3. If key is new:
   *    - Inserts PENDING record. Handles race condition via PostgreSQL unique constraint.
   */
  public async beginRequest<T = unknown>(
    params: IdempotencyCheckParams
  ): Promise<IdempotencyResolution<T>> {
    const { userId, endpoint, key, requestPayload, ttlSeconds = 86400 } = params;
    const requestHash = computeRequestHash(requestPayload);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // First attempt to find an existing record
    const existing = await this.db.idempotencyKey.findUnique({
      where: {
        userId_endpoint_key: { userId, endpoint, key },
      },
    });

    if (existing) {
      return this.resolveExistingRecord<T>(existing, requestHash);
    }

    // Try creating a new PENDING record
    try {
      const created = await this.db.idempotencyKey.create({
        data: {
          userId,
          endpoint,
          key,
          requestHash,
          status: IdempotencyStatus.PENDING,
          lockedAt: new Date(),
          expiresAt,
        },
      });

      return {
        isReplay: false,
        recordId: created.id,
        requestHash,
      };
    } catch (error: unknown) {
      // If a concurrent request created the key in the interim
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raceExisting = await this.db.idempotencyKey.findUnique({
          where: {
            userId_endpoint_key: { userId, endpoint, key },
          },
        });

        if (raceExisting) {
          return this.resolveExistingRecord<T>(raceExisting, requestHash);
        }
      }
      throw error;
    }
  }

  private resolveExistingRecord<T>(
    record: IdempotencyKey,
    currentRequestHash: string
  ): IdempotencyResolution<T> {
    // Check for payload mismatch first
    if (record.requestHash !== currentRequestHash) {
      throw new IdempotencyPayloadMismatchError();
    }

    if (record.status === IdempotencyStatus.COMPLETED) {
      let parsedData: T;
      try {
        parsedData = record.responseBody ? JSON.parse(record.responseBody) : (null as unknown as T);
      } catch {
        parsedData = record.responseBody as unknown as T;
      }

      return {
        isReplay: true,
        statusCode: record.responseCode || 200,
        data: parsedData,
        recordId: record.id,
        requestHash: currentRequestHash,
      };
    }

    if (record.status === IdempotencyStatus.PENDING) {
      throw new IdempotencyConflictError();
    }

    // If previously marked FAILED, allow re-execution or report conflict
    throw new IdempotencyConflictError(
      'A previous request with this idempotency key failed. Please use a new idempotency key.'
    );
  }

  /**
   * Marks the idempotency key as COMPLETED with the response body and status code.
   */
  public async markCompleted(
    recordId: string,
    responseCode: number,
    responseBody: unknown
  ): Promise<void> {
    await this.db.idempotencyKey.update({
      where: { id: recordId },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseCode,
        responseBody: stringifyWithBigInt(responseBody),
      },
    });
  }

  /**
   * Marks the idempotency key as FAILED without leaving a falsely COMPLETED state.
   */
  public async markFailed(
    recordId: string,
    responseCode: number = 422,
    errorBody?: unknown
  ): Promise<void> {
    await this.db.idempotencyKey.update({
      where: { id: recordId },
      data: {
        status: IdempotencyStatus.FAILED,
        responseCode,
        responseBody: errorBody ? stringifyWithBigInt(errorBody) : null,
      },
    });
  }
}
