import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db, prototypes } from '@viewport/db';
import { and, eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tabId: string }> },
) {
  try {
    const { tabId } = await params;
    const status = (req.nextUrl.searchParams.get('status') ?? 'active') as 'active' | 'archived' | 'all';

    const rows = await db()
      .select()
      .from(prototypes)
      .where(
        status === 'all'
          ? eq(prototypes.tabId, tabId)
          : and(eq(prototypes.tabId, tabId), eq(prototypes.status, status)),
      );

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[prototypes]', err);
    return NextResponse.json({ error: 'Failed to load prototypes' }, { status: 500 });
  }
}
