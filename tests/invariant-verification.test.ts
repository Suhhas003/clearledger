import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as getInvariant } from '@/app/api/invariant/verify/route';
import { NextRequest } from 'next/server';
import { getCurrentUser as getCurrentUserReal } from '@/lib/session';

// Mock session
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual('@/lib/session');
  return { ...actual, getCurrentUser: vi.fn() };
});

import { getCurrentUser } from '@/lib/session';

async function makeGetRequest() {
  const req = new Request('http://localhost/api/invariant/verify') as unknown as NextRequest;
  return await getInvariant(req);
}

describe('Invariant verification endpoint', () => {
  beforeAll(async () => {
    // Ensure there is at least one account/journal entry to verify
    // (Setup can be minimal; the endpoint works on existing DB state)
  });

  it('allows ADMIN to run verification', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: 'admin-id', role: 'ADMIN' });
    const resp = await makeGetRequest();
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data).toHaveProperty('healthy');
  });

  it('denies non‑ADMIN access', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: 'cust-id', role: 'CUSTOMER' });
    const resp = await makeGetRequest();
    expect(resp.status).toBe(403);
  });
});
