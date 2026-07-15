import { and, eq, lt, or, isNull } from 'drizzle-orm';
import { db, tabs, prototypes } from '@viewport/db';
import { scanPrototypes } from './scan.js';

const CARD_W = 1024;
const CARD_H = 768;
const GAP_X = 80;
const GAP_Y = 80;
const GRID_COLS = 3;

function gridPosition(index: number) {
  return {
    x: (index % GRID_COLS) * (CARD_W + GAP_X),
    y: Math.floor(index / GRID_COLS) * (CARD_H + GAP_Y),
  };
}

export interface SyncResult {
  tabs: number;
  prototypes: number;
  archived: number;
}

export async function runSync(prototypesRoot: string): Promise<SyncResult> {
  const syncStart = new Date();
  const { tabs: scannedTabs, prototypes: scannedProtos } = await scanPrototypes(prototypesRoot);

  // ── 1. Upsert tabs ───────────────────────────────────────────────────────────

  const tabValues = scannedTabs.map((t, i) => ({
    slug: t.slug,
    name: t.slug,
    sortOrder: i,
    lastSyncedAt: syncStart,
    updatedAt: syncStart,
  }));

  if (tabValues.length > 0) {
    await db()
      .insert(tabs)
      .values(tabValues)
      .onConflictDoUpdate({
        target: tabs.slug,
        // Preserve user-set name and sortOrder; only refresh sync timestamp.
        set: { lastSyncedAt: syncStart, updatedAt: syncStart },
      });
  }

  // ── 2. Fetch tab id map ───────────────────────────────────────────────────────

  const tabRows = await db()
    .select({ id: tabs.id, slug: tabs.slug })
    .from(tabs);
  const tabIdBySlug = new Map(tabRows.map((r) => [r.slug, r.id]));

  // ── 3. Count existing active prototypes per tab for grid positioning ──────────

  const existingRows = await db()
    .select({ tabId: prototypes.tabId, variant: prototypes.variant })
    .from(prototypes)
    .where(eq(prototypes.status, 'active'));

  const existingKeys = new Set(existingRows.map((r) => `${r.tabId}:${r.variant}`));
  const activeCountByTab = new Map<string, number>();
  for (const r of existingRows) {
    activeCountByTab.set(r.tabId, (activeCountByTab.get(r.tabId) ?? 0) + 1);
  }

  // ── 4. Upsert prototypes ─────────────────────────────────────────────────────

  let upsertedCount = 0;

  for (const proto of scannedProtos) {
    const tabId = tabIdBySlug.get(proto.tabSlug);
    if (!tabId) continue;

    const key = `${tabId}:${proto.variant}`;
    const isNew = !existingKeys.has(key);
    const pos = isNew
      ? gridPosition(activeCountByTab.get(tabId) ?? 0)
      : { x: 0, y: 0 }; // existing rows keep their DB positions via onConflictDoUpdate set

    if (isNew) {
      activeCountByTab.set(tabId, (activeCountByTab.get(tabId) ?? 0) + 1);
    }

    await db()
      .insert(prototypes)
      .values({
        tabId,
        variant: proto.variant,
        path: proto.path,
        title: proto.title,
        status: 'active',
        canvasX: pos.x,
        canvasY: pos.y,
        lastSyncedAt: syncStart,
        updatedAt: syncStart,
      })
      .onConflictDoUpdate({
        target: [prototypes.tabId, prototypes.variant],
        // Preserve canvas position; refresh status, title, path, and sync time.
        set: {
          status: 'active',
          title: proto.title,
          path: proto.path,
          lastSyncedAt: syncStart,
          updatedAt: syncStart,
        },
      });

    upsertedCount++;
  }

  // ── 5. Archive missing prototypes ─────────────────────────────────────────────

  const archived = await db()
    .update(prototypes)
    .set({ status: 'archived', updatedAt: syncStart })
    .where(
      and(
        eq(prototypes.status, 'active'),
        or(isNull(prototypes.lastSyncedAt), lt(prototypes.lastSyncedAt, syncStart)),
      ),
    )
    .returning({ id: prototypes.id });

  // ── 6. Archive tabs that have no remaining active prototypes ──────────────────
  // (Re-upsert with lastSyncedAt ensures tabs seen this run stay; any tab whose
  // slug was not in scannedTabs will have lastSyncedAt < syncStart.)
  // We don't archive tabs independently — a tab is implicitly empty if all its
  // prototypes are archived, but we keep the tab row for history.

  return {
    tabs: scannedTabs.length,
    prototypes: upsertedCount,
    archived: archived.length,
  };
}
