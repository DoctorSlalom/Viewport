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
import { relations, sql } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────────────────────────────────

export const prototypeStatus = pgEnum('prototype_status', ['active', 'archived']);

export const synthesisKind = pgEnum('synthesis_kind', [
  'synthesis',
  'suggestions',
  'decision_spec',
  'generation_spec',
]);

export const synthesisTarget = pgEnum('synthesis_target', ['prototype', 'tab']);

export const prototypeSource = pgEnum('prototype_source', [
  'unknown', 'loveable', 'v0', 'claude', 'figma', 'handwritten',
]);

// ── projects ──────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  repoUrl: text('repo_url').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── auth ──────────────────────────────────────────────────────────────────────
// Single row. Hash lives here so set-password rotates without a redeploy.

export const auth = pgTable('auth', {
  id: uuid('id').primaryKey().defaultRandom(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── tabs ──────────────────────────────────────────────────────────────────────

export const tabs = pgTable(
  'tabs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ slugUniq: uniqueIndex('tabs_slug_uniq').on(t.slug) }),
);

// ── prototypes ────────────────────────────────────────────────────────────────

export const prototypes = pgTable(
  'prototypes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabId: uuid('tab_id').notNull().references(() => tabs.id, { onDelete: 'cascade' }),
    variant: text('variant').notNull(),
    path: text('path').notNull(),
    title: text('title').notNull(),
    source: prototypeSource('source').notNull().default('unknown'),
    status: prototypeStatus('status').notNull().default('active'),
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
    tabVariantUniq: uniqueIndex('prototypes_tab_variant_uniq').on(t.tabId, t.variant),
    byTab: index('prototypes_tab_idx').on(t.tabId),
    byStatus: index('prototypes_status_idx').on(t.status),
  }),
);

// ── comments ──────────────────────────────────────────────────────────────────

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prototypeId: uuid('prototype_id').notNull().references(() => prototypes.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    pinX: doublePrecision('pin_x'),
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

// ── syntheses ─────────────────────────────────────────────────────────────────

export const syntheses = pgTable(
  'syntheses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: synthesisTarget('target_type').notNull(),
    prototypeId: uuid('prototype_id').references(() => prototypes.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id').references(() => tabs.id, { onDelete: 'cascade' }),
    kind: synthesisKind('kind').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    outputMarkdown: text('output_markdown').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPrototype: index('syntheses_prototype_idx').on(t.prototypeId),
    byTab: index('syntheses_tab_idx').on(t.tabId),
    byKind: index('syntheses_kind_idx').on(t.kind),
    // Exactly one of prototypeId or tabId must be set.
    targetCheck: sql`CHECK (
      (target_type = 'prototype' AND prototype_id IS NOT NULL AND tab_id IS NULL) OR
      (target_type = 'tab' AND tab_id IS NOT NULL AND prototype_id IS NULL)
    )`,
  }),
);

// ── decisions ─────────────────────────────────────────────────────────────────

export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabId: uuid('tab_id').notNull().references(() => tabs.id, { onDelete: 'cascade' }),
    chosenPrototypeId: uuid('chosen_prototype_id').notNull().references(() => prototypes.id),
    synthesisId: uuid('synthesis_id').references(() => syntheses.id),
    rationale: text('rationale').notNull(),
    docPath: text('doc_path').notNull(),
    committedSha: text('committed_sha'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTab: index('decisions_tab_idx').on(t.tabId) }),
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const tabsRelations = relations(tabs, ({ many }) => ({
  prototypes: many(prototypes),
  decisions: many(decisions),
  syntheses: many(syntheses),
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

export const synthesesRelations = relations(syntheses, ({ one }) => ({
  prototype: one(prototypes, { fields: [syntheses.prototypeId], references: [prototypes.id] }),
  tab: one(tabs, { fields: [syntheses.tabId], references: [tabs.id] }),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  tab: one(tabs, { fields: [decisions.tabId], references: [tabs.id] }),
  chosen: one(prototypes, { fields: [decisions.chosenPrototypeId], references: [prototypes.id] }),
  synthesis: one(syntheses, { fields: [decisions.synthesisId], references: [syntheses.id] }),
}));
