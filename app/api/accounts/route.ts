import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { generateVirtualIBAN } from '@/lib/iban';
import { AccountType, AccountStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let whereClause: any = {};
  if (user.role === 'CUSTOMER') {
    whereClause.userId = user.id;
  } else {
    // TELLER or ADMIN can optionally filter by userId
    const targetUserId = req.nextUrl.searchParams.get('userId');
    if (targetUserId) {
      whereClause.userId = targetUserId;
    }
  }

  const accounts = await prisma.account.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  const serialized = accounts.map((acc) => ({
    ...acc,
    balance: acc.balance.toString(),
  }));

  return NextResponse.json(serialized);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, currency = 'USD' } = body;

    if (!type || (type !== 'SAVINGS' && type !== 'CURRENT')) {
      return NextResponse.json(
        { error: 'Invalid account type. Only SAVINGS and CURRENT are supported.' },
        { status: 400 }
      );
    }

    // Determine owner: customers own their accounts, staff can create for a target user if specified
    let targetUserId = user.id;
    if (user.role !== 'CUSTOMER' && body.userId) {
      targetUserId = body.userId;
    }

    // Generate unique account number and virtual IBAN
    let accountNumber = '';
    let iban = '';
    let attempts = 0;

    while (attempts < 10) {
      attempts++;
      const num = Math.floor(10000000 + Math.random() * 89999999);
      accountNumber = `ACC-${num}`;
      iban = generateVirtualIBAN({ accountNumber: num });

      const existing = await prisma.account.findFirst({
        where: { OR: [{ accountNumber }, { iban }] },
      });
      if (!existing) {
        break;
      }
    }

    const newAccount = await prisma.account.create({
      data: {
        userId: targetUserId,
        accountNumber,
        iban,
        type: type as AccountType,
        status: AccountStatus.ACTIVE,
        currency,
        balance: 0n,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        ...newAccount,
        balance: newAccount.balance.toString(),
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to create account' },
      { status: 500 }
    );
  }
}
