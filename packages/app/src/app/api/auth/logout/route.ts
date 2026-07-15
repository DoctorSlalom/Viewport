import { NextResponse } from 'next/server';
import { getSessionCookieOptions } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const { name } = getSessionCookieOptions();
  response.cookies.delete(name);
  return response;
}
