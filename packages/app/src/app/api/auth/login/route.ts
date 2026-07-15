import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db, auth } from '@viewport/db';
import { createSessionToken, getSessionCookieOptions } from '@/lib/session';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.password !== 'string' || typeof body.displayName !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { password, displayName } = body as { password: string; displayName: string };

  if (!displayName.trim()) {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
  }

  const [authRow] = await db().select().from(auth).limit(1);
  if (!authRow) {
    return NextResponse.json({ error: 'Not initialized' }, { status: 503 });
  }

  const valid = await compare(password, authRow.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createSessionToken({ displayName: displayName.trim() });
  const cookieOpts = getSessionCookieOptions();

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...cookieOpts,
    value: token,
  });

  return response;
}
