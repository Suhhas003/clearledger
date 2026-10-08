import { randomUUID } from 'crypto';
import { PrismaClient, IdempotencyStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { LedgerService } from './ledger-service';
import { IdempotencyService } from '../idempotency/idempotency-service';
import { computeRequestHash } from '../idempotency/hash';

export interface TransferWithIdempotencyParams {
  userId: string;
  idempotencyKey?: string;
  endpoint?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: bigint;
  currency?: string;
  description?: string;
}

export interface TransferServiceResponse {
  isReplay: boolean;
  statusCode: number;
  data: any;
}

export class TransferService {
  private readonly ledgerService: LedgerService;
  private readonly idempotencyService: IdempotencyService;

  constructor(private readonly db: PrismaClient = defaultPrisma) {
    this.ledgerService = new LedgerService(this.db);
    this.idempotencyService = new IdempotencyService(this.db);
  }

  /**
   * Executes a transfer with idempotency and retry safety.
   *
   * The critical ledger operation and the COMPLETED idempotency state
   * are committed inside the SAME PostgreSQL transaction.
   *
   * Flow:
   *
   * 1. Acquire the idempotency key.
   * 2. Return cached response for an identical completed request.
   * 3. Reject payload mismatch.
   * 4. Reject an active concurrent request.
   * 5. Execute the ledger transfer.
   * 6. Mark the idempotency record COMPLETED.
   * 7. Commit everything atomically.
   */
  public async transfer(
    params: TransferWithIdempotencyParams
  ): Promise<TransferServiceResponse> {
    const key = params.idempotencyKey || randomUUID();
    const endpoint = params.endpoint || '/api/transfers';
    const currency = params.currency || 'USD';
    const description =
      params.description ||
      `Transfer to ${params.toAccountId}`;

    const requestPayload = {
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amount: params.amount.toString(),
      currency,
      description,
    };

    const requestHash = computeRequestHash(requestPayload);

    /*
     * First perform the idempotency lookup/claim.
     *
     * This remains outside the main transfer transaction because
     * beginRequest() handles the initial uniqueness race and replay
     * detection.
     */
    const resolution =
      await this.idempotencyService.beginRequest({
        userId: params.userId,
        endpoint,
        key,
        requestPayload,
      });

    // Exact retry of an already completed request.
    if (resolution.isReplay) {
      return {
        isReplay: true,
        statusCode: resolution.statusCode,
        data: resolution.data,
      };
    }

    /*
     * The initial idempotency record is now PENDING.
     *
     * From this point onward, ledger changes and the transition
     * PENDING -> COMPLETED happen in ONE PostgreSQL transaction.
     */
    try {
      return await this.db.$transaction(async (tx) => {
        /*
         * Re-read the idempotency record inside the transaction.
         *
         * This protects against another request changing the record
         * between beginRequest() and this transaction.
         */
        const idempotencyRecord =
          await tx.idempotencyKey.findUnique({
            where: {
              id: resolution.recordId,
            },
          });

        if (!idempotencyRecord) {
          throw new Error(
            'Idempotency record no longer exists.'
          );
        }

        if (
          idempotencyRecord.requestHash !== requestHash
        ) {
          throw new Error(
            'Idempotency request payload does not match the original request.'
          );
        }

        /*
         * If another transaction already completed this key,
         * return its cached response instead of executing another
         * transfer.
         */
        if (
          idempotencyRecord.status ===
          IdempotencyStatus.COMPLETED
        ) {
          let cachedData: any = null;

          if (idempotencyRecord.responseBody) {
            cachedData = JSON.parse(
              idempotencyRecord.responseBody
            );
          }

          return {
            isReplay: true,
            statusCode:
              idempotencyRecord.responseCode || 200,
            data: cachedData,
          };
        }

        /*
         * A FAILED key is deliberately not reused.
         *
         * The public idempotency service already treats failed keys
         * as non-reusable, so preserve that behavior here.
         */
        if (
          idempotencyRecord.status ===
          IdempotencyStatus.FAILED
        ) {
          throw new Error(
            'A previous request with this idempotency key failed. Please use a new idempotency key.'
          );
        }

        /*
         * Execute the ledger operation using the EXISTING transaction.
         *
         * This is the important part: no nested transaction is created.
         */
        const transferResult =
          await this.ledgerService.transferInTransaction(
            tx,
            {
              debtorAccountId:
                params.fromAccountId,
              creditorAccountId:
                params.toAccountId,
              amount: params.amount,
              description,
              idempotencyId:
                resolution.recordId,
            }
          );

        const responsePayload = {
          success: true,
          transaction: {
            journalEntryId:
              transferResult.journalEntryId,
            reference:
              transferResult.reference,
            fromAccountId:
              transferResult.debtorAccountId,
            toAccountId:
              transferResult.creditorAccountId,
            amount:
              transferResult.amount.toString(),
            currency:
              transferResult.currency,
            fromBalanceAfter:
              transferResult.debtorBalanceAfter.toString(),
            toBalanceAfter:
              transferResult.creditorBalanceAfter.toString(),
            postedAt:
              transferResult.postedAt.toISOString(),
          },
        };

        /*
         * Mark idempotency COMPLETED using the SAME transaction client.
         *
         * Therefore:
         *
         *   Ledger COMMIT
         *   +
         *   Idempotency COMPLETED
         *
         * happen atomically.
         */
        await tx.idempotencyKey.update({
          where: {
            id: resolution.recordId,
          },
          data: {
            status: IdempotencyStatus.COMPLETED,
            responseCode: 201,
            responseBody:
              JSON.stringify(
                responsePayload
              ),
          },
        });

        return {
          isReplay: false,
          statusCode: 201,
          data: responsePayload,
        };
      },
      { timeout: 30000, maxWait: 10000 }
      );
    } catch (err: any) {
      /*
       * The ledger transaction has rolled back at this point.
       *
       * Therefore it is safe to mark the idempotency record FAILED
       * in a separate transaction.
       *
       * Successful transfers never reach this block because their
       * ledger changes and COMPLETED state are committed atomically
       * inside the same PostgreSQL transaction.
       */
      try {
        await this.idempotencyService.markFailed(
          resolution.recordId,
          err.statusCode || 422,
          {
            error: err.message,
            code: err.code || 'TRANSFER_FAILED',
          }
        );
      } catch {
        /*
         * Preserve the original transfer error if the failure-state
         * update itself encounters an unexpected database error.
         */
      }

      throw err;
    }
  }
}