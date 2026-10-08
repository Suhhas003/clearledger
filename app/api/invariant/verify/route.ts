import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { verifyLedgerInvariants } from '@/lib/ledger/invariant';
import { isAdmin } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await verifyLedgerInvariants(prisma);
  // Convert BigInt values to strings for safe JSON serialization
  const safeResult = JSON.parse(JSON.stringify(result, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  ));
  return NextResponse.json(safeResult);

}
