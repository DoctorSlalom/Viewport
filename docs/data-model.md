# Viewport — Data Model

> Concrete Drizzle schema for the dynamic data that lives in Postgres. This is the contract the API routes, canvas, and AI features build against.

Companion to [`../TECHNICAL_PLAN.md`](../TECHNICAL_PLAN.md) §3. Recall the persistence boundary: **the DB holds mutable, multi-user data** (comments, canvas state, AI outputs); **the repo holds durable markdown artifacts** (decision & generation specs). Nothing here is committed to git.

---

## 1. Entities at a glance

```
projects ─┐
          │ (single row in practice — one deployment = one project)
auth ─────┘ (single row — the shared team password hash)

tabs 1───* prototypes 1───* comments (self-referencing for threaded replies)
                 │
tabs 1───* decisions *───1 prototypes (the chosen variant)

syntheses ──► points at a prototype OR a tab (nullable FKs), typed by `kind`
decisions ──► optionally references the `decision_spec` synthesis that produced its doc
```

Guiding rules baked into the schema:

- **No user table.** Identity is a display name captured at login (single shared password). Author fields are plain text.
- **Archive, never delete.** When a prototype folder disappears from the repo, its row is set to `status = 'archived'` — comments, syntheses, and decision history survive. Losing variants in a decision are archived the same way.
- **Reproducible AI outputs.** Every synthesis snapshots its exact inputs (`input_snapshot`) so a result can be traced back to the comments that produced it, even after those comments change.
- **Sync is idempotent.** A `last_synced_at` timestamp lets a sync run reconcile the filesystem against the DB without ever losing data.

---

## 2. Drizzle schema (`packages/db/schema.ts`)

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────────────────────────────────
export const prototypeStatus = pgEnum('prototype_status', ['active', 'archived']);
export const synthesisKind = pgEnum('synthesis_kind', [
  'synthesis',       // summarize comments
  'suggestions',     // prioritized changes from a synthesis
  'decision_spec',   // "what was considered / chosen / why" → committed to repo
  'generation_spec', // brief for the next prototype round
]);
export const synthesisTarget = pgEnum('synthesis_target', ['prototype', 'tab']);
// Optional provenance hint for where a prototype came from.
export const prototypeSource = pgEnum('prototype_source', [
  'unknown', 'loveable', 'v0', 'claude', 'figma', 'handwritten',
]);

// ── projects ──────────────────────────────────────────────────────────────────
// One row per deployment in practice; modeled as a table for future multi-project.
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  repoUrl: text('repo_url').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── auth ────────────────────────────────────────────────────────────────────
// Single row. Storing the hash here (not an env var) is what lets `set-password`
// rotate credentials WITHOUT a redeploy — verification reads this at runtime.
export const auth = pgTable('auth', {
  id: uuid('id').primaryKey().defaultRandom(),
  passwordHash: text('password_hash').notNull(), // argon2id
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── tabs ──────────────────────────────────────────────────────────────────────
// One tab per top-level folder under prototypes/. `slug` = the folder name.
export const tabs = pgTable(
  'tabs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),          // e.g. "homepage"
    name: text('name').notNull(),          // display name, defaults to slug
    sortOrder: integer('sort_order').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugUniq: uniqueIndex('tabs_slug_uniq').on(t.slug) }),
);

// ── prototypes (canvas cards) ──────────────────────────────────────────────────
// One row per variant folder that contains an index.html.
export const prototypes = pgTable(
  'prototypes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabId: uuid('tab_id').notNull().references(() => tabs.id, { onDelete: 'cascade' }),
    variant: text('variant').notNull(),   // folder name, e.g. "variant-a"
    path: text('path').notNull(),         // repo-relative, e.g. "prototypes/homepage/variant-a"
    title: text('title').notNull(),       // display title (from folder or <title>)
    source: prototypeSource('source').notNull().default('unknown'),
    status: prototypeStatus('status').notNull().default('active'),
    // Canvas layout — multi-user, lives here rather than in state.json.
    canvasX: doublePrecision('canvas_x').notNull().default(0),
    canvasY: doublePrecision('canvas_y').notNull().default(0),
    width: doublePrecision('width').notNull().default(1024),
    height: doublePrecision('height').notNull().default(768),
    zIndex: integer('z_index').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // A variant name is unique within its tab.
    tabVariantUniq: uniqueIndex('prototypes_tab_variant_uniq').on(t.tabId, t.variant),
    byTab: index('prototypes_tab_idx').on(t.tabId),
    byStatus: index('prototypes_status_idx').on(t.status),
  }),
);

// ── comments ────────────────────────────────────────────────────────────────
// Pinned to a prototype; optional (pinX, pinY) places the pin on the card.
// Self-referencing parentId supports one level of threaded replies.
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prototypeId: uuid('prototype_id').notNull().references(() => prototypes.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),           // FK added below (self-reference)
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    pinX: doublePrecision('pin_x'),        // null = card-level (unpinned) comment
    pinY: doublePrecision('pin_y'),
    resolved: boolean('resolved').notNull().default(false),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPrototype: index('comments_prototype_idx').on(t.prototypeId),
    byResolved: index('comments_prototype_resolved_idx').on(t.prototypeId, t.resolved),
    parentFk: index('comments_parent_idx').on(t.parentId),
  }),
);

// ── syntheses (AI outputs) ─────────────────────────────────────────────────────
// Targets a prototype OR a tab (exactly one FK set — enforced in app + a CHECK).
export const syntheses = pgTable(
  'syntheses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: synthesisTarget('target_type').notNull(),
    prototypeId: uuid('prototype_id').references(() => prototypes.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id').references(() => tabs.id, { onDelete: 'cascade' }),
    kind: synthesisKind('kind').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(), // the comments/context fed to the model
    outputMarkdown: text('output_markdown').notNull(),
    model: text('model').notNull(),                   // e.g. "claude-sonnet-5"
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPrototype: index('syntheses_prototype_idx').on(t.prototypeId),
    byTab: index('syntheses_tab_idx').on(t.tabId),
    byKind: index('syntheses_kind_idx').on(t.kind),
  }),
);

// ── decisions ──────────────────────────────────────────────────────────────────
// Promoting a direction: records the chosen variant + the committed markdown doc.
export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabId: uuid('tab_id').notNull().references(() => tabs.id, { onDelete: 'cascade' }),
    chosenPrototypeId: uuid('chosen_prototype_id').notNull().references(() => prototypes.id),
    synthesisId: uuid('synthesis_id').references(() => syntheses.id), // the decision_spec, if any
    rationale: text('rationale').notNull(),
    docPath: text('doc_path').notNull(),          // repo-relative, e.g. "decisions/homepage-2026-07.md"
    committedSha: text('committed_sha'),           // git sha of the commit that wrote docPath
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTab: index('decisions_tab_idx').on(t.tabId) }),
);
```

### Relations

```ts
export const tabsRelations = relations(tabs, ({ many }) => ({
  prototypes: many(prototypes),
  decisions: many(decisions),
}));

export const prototypesRelations = relations(prototypes, ({ one, many }) => ({
  tab: one(tabs, { fields: [prototypes.tabId], references: [tabs.id] }),
  comments: many(comments),
  syntheses: many(syntheses),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  prototype: one(prototypes, { fields: [comments.prototypeId], references: [prototypes.id] }),
  parent: one(comments, { fields: [comments.parentId], references: [comments.id], relationName: 'thread' }),
  replies: many(comments, { relationName: 'thread' }),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  tab: one(tabs, { fields: [decisions.tabId], references: [tabs.id] }),
  chosen: one(prototypes, { fields: [decisions.chosenPrototypeId], references: [prototypes.id] }),
  synthesis: one(syntheses, { fields: [decisions.synthesisId], references: [syntheses.id] }),
}));
```

> **Note:** the `comments.parentId` self-reference and the `syntheses` "exactly one of `prototypeId`/`tabId`" CHECK constraint are added in a follow-up migration statement (Drizzle handles the self-FK and raw CHECK via `sql`), since they can't be expressed inline above.

---

## 3. Sync reconciliation algorithm

`/api/sync` walks `prototypes/` and reconciles it with the DB idempotently:

1. Stamp `syncStartedAt = now()`.
2. For each top-level folder → **upsert a tab** (by `slug`), set `lastSyncedAt = syncStartedAt`.
3. For each variant folder containing `index.html` → **upsert a prototype** (by `tabId + variant`), set `status = 'active'`, refresh `title`/`path`, set `lastSyncedAt = syncStartedAt`. New rows get default canvas coordinates (simple grid layout).
4. **Archive the missing:** any `active` prototype whose `lastSyncedAt < syncStartedAt` is set to `status = 'archived'` (its folder is gone). Same for tabs with no remaining active prototypes.
5. Never hard-delete. Comments, syntheses, and decisions referencing archived prototypes remain intact.

This makes sync safe to run on every deploy (via Vercel's post-deploy hook) or on demand.

---

## 4. Connection & migrations

- **Driver:** `@neondatabase/serverless` + `drizzle-orm/neon-http` (HTTP driver avoids connection-pool exhaustion in serverless functions). For long-lived/local dev, the standard `pg` pool works too.
- **Migrations:** `drizzle-kit generate` produces SQL migrations checked into `packages/db/migrations/`; they run on deploy. Schema changes are additive where possible (new nullable columns, new tables) so a deploy never blocks on a destructive migration.
- **Seeding:** the `create-viewport` setup call inserts the single `projects` and `auth` rows.

---

## 5. Why these shapes

| Choice | Reason |
|---|---|
| `uuid` PKs with `defaultRandom()` | Safe to reference in URLs/client without leaking counts or ordering. |
| Canvas coords as `doublePrecision` | Smooth fractional drag/zoom positioning without integer rounding jitter. |
| `pinX/pinY` nullable | Distinguishes a card-level comment from one pinned to a spot on the prototype. |
| `syntheses.input_snapshot` (jsonb) | Reproducibility/audit — the exact input is frozen even as comments evolve. |
| Two nullable FKs on `syntheses` | Keeps referential integrity for both target types without a polymorphic id. |
| `decisions.committedSha` | Ties a decision to the actual git commit that wrote its markdown doc. |
| Archive flags instead of deletes | Matches the brief's "losing variants are archived, not deleted" and preserves history. |
