import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Next.js 14 App Router expects separate GET and POST handlers.
export const GET = NextAuth(authOptions);
export const POST = NextAuth(authOptions);
