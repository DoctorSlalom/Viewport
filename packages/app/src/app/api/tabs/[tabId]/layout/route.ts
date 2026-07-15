import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db, prototypes } from '@viewport/db';
import { eq } from 'drizzle-orm';

type LayoutUpdate = { id: string; canvasX: number; canvasY: number; zIndex?: number };

export async function PATCH(req: NextRequest) {
  try {
    const { updates } = (await req.json()) as { updates: LayoutUpdate[] };
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates must be a non-empty array' }, { status: 422 });
    }

    await Promise.all(
      updates.map(({ id, canvasX, canvasY, zIndex }) =>
        db()
          .update(prototypes)
          .set({
            canvasX,
            canvasY,
            ...(zIndex !== undefined && { zIndex }),
            updatedAt: new Date(),
          })
          .where(eq(prototypes.id, id)),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[layout]', err);
    return NextResponse.json({ error: 'Failed to update layout' }, { status: 500 });
  }
}
