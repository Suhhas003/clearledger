import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Helper to retrieve the current authenticated user on the server side.
 * Returns the minimal user fields (id, email, name, role) extracted from the
 * Next‑Auth session. Returns `null` when no session exists.
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  // The session.user object contains the fields we stored in the JWT.
  const { id, email, name, role } = session.user as any;
  return { id, email, name, role };
}
