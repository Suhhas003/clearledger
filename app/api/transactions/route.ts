import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { isAdmin, isTeller, canAccessAccount } from '@/lib/rbac';

/**
 * GET /api/transactions
 * Query params:
 *  - page (default 1)
 *  - limit (default 20)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const skip = (page - 1) * limit;

  // Build base filter
  let whereClause: any = {};
  if (user.role === 'CUSTOMER') {
    // Customer can only see journals where either posting involves an account they own
    const userAccounts = await prisma.account.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const accountIds = userAccounts.map((a) => a.id);
    whereClause = {
      OR: [
        { postings: { some: { accountId: { in: accountIds } } } },
      ],
    };
  } // TELLER and ADMIN see everything

  const journals = await prisma.journalEntry.findMany({
    where: whereClause,
    include: { postings: true },
    orderBy: { postedAt: 'desc' },
    skip,
    take: limit,
  });

  const total = await prisma.journalEntry.count({ where: whereClause });
  const totalPages = Math.ceil(total / limit);

  // Serialize BigInt amounts as strings
  const serialized = journals.map((j) => ({
    ...j,
    postings: j.postings.map((p) => ({
      ...p,
      amount: p.amount.toString(),
      balanceAfter: p.balanceAfter.toString(),
    })),
  }));

  return NextResponse.json({
    page,
    limit,
    total,
    totalPages,
    data: serialized,
  });
}
