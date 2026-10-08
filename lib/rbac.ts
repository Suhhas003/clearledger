export enum Role {
  CUSTOMER = 'CUSTOMER',
  TELLER = 'TELLER',
  ADMIN = 'ADMIN',
}

export function isAdmin(user: { role: string } | null): boolean {
  return !!user && user.role === Role.ADMIN;
}

export function isTeller(user: { role: string } | null): boolean {
  return !!user && user.role === Role.TELLER;
}

export function isCustomer(user: { role: string } | null): boolean {
  return !!user && user.role === Role.CUSTOMER;
}

/**
 * Checks whether the user is allowed to access the given account.
 * ADMIN and TELLER can access any account. CUSTOMER can only access accounts they own.
 */
export async function canAccessAccount(
  user: { id: string; role: string } | null,
  accountId: string,
  prisma: any
): Promise<boolean> {
  if (!user) return false;
  if (user.role === Role.ADMIN || user.role === Role.TELLER) return true;
  // CUSTOMER
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });
  if (!account) return false;
  return account.userId === user.id;
}
