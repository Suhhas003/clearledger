import { NextRequest, NextResponse } from 'next/server';
import { TransferService } from '@/lib/ledger/transfer-service';
import { LedgerError } from '@/lib/ledger/errors';
import {
  IdempotencyConflictError,
  IdempotencyPayloadMismatchError,
} from '@/lib/idempotency/errors';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

const transferService = new TransferService(prisma);

export async function POST(req: NextRequest) {
  // Authenticate the request
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      req.headers.get('Idempotency-Key') ||
      undefined;

    const body = await req.json();
    const { fromAccountId, toAccountId, amount, currency = 'USD', description } = body;

    if (!fromAccountId || !toAccountId) {
      return NextResponse.json(
        { error: 'fromAccountId and toAccountId are required' },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null) {
      return NextResponse.json({ error: 'amount is required' }, { status: 400 });
    }

    // Parse amount to minor units (BigInt)
    let parsedAmount: bigint;
    try {
      if (typeof amount === 'string' && amount.includes('.')) {
        const [whole, frac = ''] = amount.split('.');
        const paddedFrac = (frac + '00').slice(0, 2);
        parsedAmount = BigInt(whole) * 100n + BigInt(paddedFrac);
      } else {
        parsedAmount = BigInt(amount);
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid amount format. Must be a numeric string or integer.' },
        { status: 400 }
      );
    }

    if (parsedAmount <= 0n) {
      return NextResponse.json(
        { error: 'Transfer amount must be strictly positive (> 0)' },
        { status: 400 }
      );
    }

    // RBAC – enforce CUSTOMER ownership of the debtor account
    if (user.role === 'CUSTOMER') {
      const debtor = await prisma.account.findUnique({
        where: { id: fromAccountId },
        select: { userId: true },
      });
      if (!debtor || debtor.userId !== user.id) {
        return NextResponse.json({ error: 'Forbidden: account ownership mismatch' }, { status: 403 });
      }
    }

    // Execute transfer using the authenticated user ID for idempotency scope
    const result = await transferService.transfer({
      userId: user.id,
      idempotencyKey,
      endpoint: '/api/transfers',
      fromAccountId,
      toAccountId,
      amount: parsedAmount,
      currency,
      description,
    });

    const responseHeaders: Record<string, string> = {};
    if (result.isReplay) {
      responseHeaders['Idempotent-Replayed'] = 'true';
    }

    return NextResponse.json(result.data, {
      status: result.statusCode,
      headers: responseHeaders,
    });
  } catch (err: any) {
    if (err instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof IdempotencyPayloadMismatchError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    if (err instanceof LedgerError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
