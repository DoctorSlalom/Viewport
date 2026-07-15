import type { NextRequest } from 'next/server';
import { getSession } from './session.js';

export async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await getSession(req);
  if (session) return true;

  const adminToken = process.env['VIEWPORT_ADMIN_TOKEN'];
  if (adminToken) {
    const auth = req.headers.get('Authorization');
    if (auth === `Bearer ${adminToken}`) return true;
  }

  return false;
}
