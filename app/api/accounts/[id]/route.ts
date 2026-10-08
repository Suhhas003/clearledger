import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { canAccessAccount } from '@/lib/rbac';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = params;
  const authorized = await canAccessAccount(user, id, prisma);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      postings: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          journalEntry: {
            select: {
              reference: true,
              description: true,
              type: true,
              postedAt: true,
            },
          },
        },
      },
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const serialized = {
    ...account,
    balance: account.balance.toString(),
    postings: account.postings.map((p) => ({
      ...p,
      amount: p.amount.toString(),
      balanceAfter: p.balanceAfter.toString(),
    })),
  };

  return NextResponse.json(serialized);
}
