import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolve } from 'node:path';
import { isAuthorized } from '@/lib/admin-auth';
import { runSync } from '@/lib/sync';

function prototypesRoot(): string {
  return process.env['PROTOTYPES_ROOT'] ?? resolve(process.cwd(), '../../prototypes');
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync(prototypesRoot());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[sync]', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
