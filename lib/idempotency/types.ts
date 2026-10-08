export interface IdempotencyCheckParams {
  userId: string;
  endpoint: string;
  key: string;
  requestPayload: unknown;
  ttlSeconds?: number; // Default: 86400 (24h)
}

export type IdempotencyResolution<T = unknown> =
  | {
      isReplay: false;
      recordId: string;
      requestHash: string;
    }
  | {
      isReplay: true;
      statusCode: number;
      data: T;
      recordId: string;
      requestHash: string;
    };
