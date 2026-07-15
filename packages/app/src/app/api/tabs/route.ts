import { NextResponse } from 'next/server';
import { db, tabs } from '@viewport/db';
import { asc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db().select().from(tabs).orderBy(asc(tabs.sortOrder));
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[tabs]', err);
    return NextResponse.json({ error: 'Failed to load tabs' }, { status: 500 });
  }
}
