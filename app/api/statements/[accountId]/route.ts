import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { canAccessAccount } from '@/lib/rbac';
import { calculateReplayBalance } from '@/lib/ledger/invariant';
import { PostingDirection, AccountType } from '@prisma/client';

/**
 * GET /api/statements/:accountId?month=YYYY-MM
 * Generates a PDF mini‑statement for the given account and month.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { accountId: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { accountId } = params;
  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  }

  // Authorization
  const authorized = await canAccessAccount(user, accountId, prisma);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse month (YYYY-MM) – default to current month
  const monthParam = req.nextUrl.searchParams.get('month');
  const now = new Date();
  const [year, month] = monthParam
    ? monthParam.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1)); // exclusive

  // Load account and its postings within the month
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      postings: {
        where: { createdAt: { gte: startDate, lt: endDate } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Opening balance = replay balance before startDate
  const priorPostings = await prisma.ledgerPosting.findMany({
    where: { accountId, createdAt: { lt: startDate } },
    orderBy: { createdAt: 'asc' },
  });
  const openingBalance = calculateReplayBalance(
    account.type as AccountType,
    priorPostings.map((p) => ({ direction: p.direction as PostingDirection, amount: p.amount })),
  );

  // Generate PDF
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('ClearLedger Mini‑Statement', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Account: ${account.accountNumber}`);
    doc.text(`IBAN: ${account.iban}`);
    doc.text(`Type: ${account.type}`);
    doc.text(`Currency: ${account.currency}`);
    doc.text(`Statement Period: ${year}-${String(month).padStart(2, '0')}`);
    doc.text(`Opening Balance: ${openingBalance.toString()}`);
    doc.moveDown();

    // Table header
    doc.fontSize(10).text('Date', 50, doc.y, { width: 80, align: 'left' });
    doc.text('Reference', 130, doc.y, { width: 150, align: 'left' });
    doc.text('Debit', 280, doc.y, { width: 70, align: 'right' });
    doc.text('Credit', 350, doc.y, { width: 70, align: 'right' });
    doc.text('Balance', 420, doc.y, { width: 80, align: 'right' });
    doc.moveDown();

    let runningBalance = openingBalance;
    for (const posting of account.postings) {
      const dateStr = posting.createdAt.toISOString().split('T')[0];
      const ref = '';
      const amount = posting.amount;
      const isDebit = posting.direction === PostingDirection.DEBIT;
      const debit = isDebit ? amount.toString() : '';
      const credit = !isDebit ? amount.toString() : '';
      runningBalance = isDebit ? runningBalance - amount : runningBalance + amount;
      doc.text(dateStr, 50, doc.y, { width: 80, align: 'left' });
      doc.text(ref, 130, doc.y, { width: 150, align: 'left' });
      doc.text(debit, 280, doc.y, { width: 70, align: 'right' });
      doc.text(credit, 350, doc.y, { width: 70, align: 'right' });
      doc.text(runningBalance.toString(), 420, doc.y, { width: 80, align: 'right' });
      doc.moveDown();
    }

    doc.text(`Closing Balance: ${runningBalance.toString()}`, { align: 'right' });
    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${account.accountNumber}-${year}-${String(
        month,
      ).padStart(2, '0')}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    },
  });
}
