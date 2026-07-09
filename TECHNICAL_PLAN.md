# Viewport — Technical Plan

> A phased, MVP-first plan for building Viewport: a collaborative prototype-review canvas that lives in a repo and deploys to Vercel.

This document translates the product brief in [`README.md`](./README.md) into an engineering plan. It fixes the core architectural decisions, defines the data model and system boundaries, and sequences the build into shippable phases.

---

## 1. Decisions locked in

| Area | Decision | Rationale |
|---|---|---|
| App framework | **Next.js (App Router) + TypeScript**, deployed to Vercel | Matches the brief's Vercel target; App Router gives us route handlers, middleware auth, and streaming for AI. |
| Database | **Postgres** (Vercel Postgres / Neon) via **Drizzle ORM** | Relational model fits comments/prototypes/syntheses; Drizzle is lightweight and serverless-friendly. |
| Persistence boundary | **DB = mutable/multi-user data** (comments, canvas state, AI outputs). **Repo = durable artifacts** (generated markdown specs & decision docs). | Keeps git history clean (no comment spam), avoids merge conflicts, and makes the repo the source of truth for *decisions*, not raw feedback. |
| Writes back to repo | Generated markdown committed via **GitHub API (Octokit)** on explicit user action | The only path that writes to the repo; deliberate and infrequent, so commit-via-API is a good fit. |
| Auth | **Single shared team password** → signed httpOnly session cookie; hash stored in **DB** | DB-stored hash lets `set-password` rotate without a redeploy (honors the brief). |
| AI | **Anthropic Claude** (`claude-sonnet-5` default, `claude-opus-4-8` for heavy synthesis), model configurable | Strong summarization/synthesis; streaming supported for live UX. |
| CLI | **Thin** — scaffold folders, set password, trigger deploy | Most logic lives in the web app; fastest path to a working demo. |
| Delivery | **Phased, MVP-first** | Ship canvas + comments early, layer AI and integrations after. |

---

## 2. System architecture

### 2.1 Deployment shape

`create-viewport` installs Viewport into the user's repo and wires a Vercel deployment. The Viewport **app is distributed as an npm package** (`viewport`); the repo gets:

- the scaffolded folder structure (`prototypes/`, `decisions/`, `assets/`),
- a `viewport.config.json`,
- a thin app entry that runs the packaged Next.js app.

This lets teams update Viewport with `npm update viewport` instead of regenerating scaffolding. Because the app deploys *from* the repo, the `prototypes/` folder ships inside the deployment bundle and is readable at request time.

```
┌─────────────────────────── Vercel deployment (from user repo) ───────────────────────────┐
│                                                                                            │
│   Next.js app (app origin: viewport.example.com)                                           │
│   ├── Middleware auth gate (shared-password cookie)                                        │
│   ├── Canvas UI (React) ── reads prototypes list + state from API                          │
│   ├── API route handlers ── comments, sync, AI, decisions                                  │
│   └── Prototype file reader ── serves prototypes/** from bundle                            │
│                                                                                            │
│   Prototype content served from a SEPARATE sandbox origin (proto.viewport.example.com)     │
│   so untrusted prototype HTML cannot read the app's auth cookie or call its APIs.          │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │                          │                              │
        ▼                          ▼                              ▼
  Postgres (Neon)           Anthropic API                 GitHub API (Octokit)
  comments, canvas          synthesis / specs             commit generated markdown
  state, AI outputs                                       back into the repo
```

### 2.2 Prototype rendering & the untrusted-HTML boundary

Prototypes are **arbitrary HTML dropped in by team members** — effectively untrusted code. This is the single most important security concern.

- Prototype content is served from a **separate origin** (e.g. `proto.` subdomain, or a distinct Vercel deployment) so it cannot access the app's auth cookie (cookie scoped to the app origin only) or same-origin APIs.
- Each card renders the prototype in a **sandboxed `<iframe>`** (`sandbox="allow-scripts allow-forms"`, no `allow-same-origin` relative to the app).
- A strict **CSP** on the prototype origin limits what prototype scripts can reach.
- The prototype file reader validates paths (no traversal outside `prototypes/`) and only serves within a variant folder.

> **Full design:** threat model, iframe sandbox flags, response headers, the cross-origin auth handshake, and path-traversal defense are detailed in [`docs/prototype-sandbox.md`](./docs/prototype-sandbox.md).

### 2.3 Canvas sync

"Sync" reconciles the filesystem with the DB:

1. Scan `prototypes/` → top-level folders become **tabs**, variant folders containing `index.html` become **cards**.
2. Upsert tabs/cards into the DB (new ones get default canvas positions; missing ones are marked archived, not deleted).
3. Canvas **positions/layout live in the DB** (moved off `state.json`) because they are multi-user and change often — committing them would create noise and conflicts.

Sync runs on demand (`/api/sync`), and can be triggered on Vercel's post-deploy hook so a push refreshes the canvas.

### 2.4 API surface

The full HTTP contract — every route grouped by origin, with auth requirement, payload, and response — is specified in [`docs/api-surface.md`](./docs/api-surface.md). It defines three caller types (reviewer session, machine bearer token, prototype ticket), the CSRF/rate-limit conventions, and the streaming AI endpoints.

---

## 3. Data model (Postgres / Drizzle)

```
projects        (id, name, repo_url, created_at)
auth            (id, password_hash, updated_at)                    -- single row; rotated by set-password
tabs            (id, slug, name, sort_order, created_at)
prototypes      (id, tab_id→tabs, variant, path, title,
                 status['active'|'archived'],
                 canvas_x, canvas_y, z_index, created_at, updated_at)
comments        (id, prototype_id→prototypes, author_name, body,
                 pin_x, pin_y, resolved, created_at)               -- author_name only; no accounts
syntheses       (id, target_type['prototype'|'tab'], target_id,
                 kind['synthesis'|'suggestions'|'decision_spec'|'generation_spec'],
                 input_snapshot(jsonb), output_markdown, model, created_at)
decisions       (id, tab_id→tabs, chosen_prototype_id→prototypes,
                 rationale, doc_path, committed_sha, created_at)    -- doc_path = markdown written to repo
```

Notes:
- No user table — identity is a display name captured per session (single shared password).
- `syntheses.input_snapshot` records exactly which comments fed a generation, so outputs are reproducible/auditable.
- `decisions.doc_path` + `committed_sha` link a decision to the markdown file committed into `decisions/`.

> **Concrete schema:** the full Drizzle table definitions, relations, indexes, the sync reconciliation algorithm, and the connection/migration approach live in [`docs/data-model.md`](./docs/data-model.md).

---

## 4. Authentication

- Password set at init → **bcrypt/argon2 hash stored in the `auth` table**.
- Login route verifies the password, issues a **signed httpOnly, SameSite=Lax session cookie** (JWT via `jose`), captures a display name.
- **Middleware** gates all app routes except `/login`; prototype content lives on the separate origin and is gated by its own signed token check.
- `viewport set-password` updates the `auth` row → **no redeploy needed** (the brief's requirement), since verification reads the DB at runtime.

---

## 5. AI features (Anthropic Claude)

| Feature | Input | Output | Persistence |
|---|---|---|---|
| Synthesize feedback | All comments on a prototype | Coherent summary of the signal | `syntheses` (kind=`synthesis`) |
| Suggest changes | A synthesis | Prioritized change list | `syntheses` (kind=`suggestions`) |
| Generate decision spec | Considered variants + chosen + rationale | Decision markdown | `syntheses` + committed to `decisions/` |
| Generate generation spec | Synthesis + direction | Brief for next prototype round | `syntheses` + optionally committed |

- Calls go through a server route handler using the Anthropic SDK; **responses stream** to the UI for a live feel.
- Default model `claude-opus-4-8` (configurable down to `claude-sonnet-5` / `claude-haiku-4-5` for cost); adaptive thinking with a configurable `effort`. Set in `viewport.config.json`.
- **Repo write path:** generating a decision/generation spec (on explicit user action) commits the markdown via Octokit to `decisions/` (or `specs/`), records `committed_sha`. Losing variants are marked `archived` in the DB, not deleted (matches the brief).
- API key stored as a Vercel env var (`ANTHROPIC_API_KEY`).

> **Full design:** prompt architecture, input snapshotting, streaming-to-SSE, structured output for suggestions, the Octokit commit transaction, and prompt-injection defenses are in [`docs/ai-synthesis.md`](./docs/ai-synthesis.md).

---

## 6. The CLI (`create-viewport` + `viewport`)

Thin by design. Node CLI (e.g. `commander` + `prompts`).

| Command | Does |
|---|---|
| `npx create-viewport` | Scaffold folders + `viewport.config.json`, install `viewport`, prompt for team password (hash → DB via a one-time setup call), link + trigger Vercel deploy, print URL. |
| `npx viewport deploy` | Trigger a Vercel redeploy. |
| `npx viewport sync` | Call the app's `/api/sync` to reconcile `prototypes/` with the DB. |
| `npx viewport set-password` | Prompt + update the `auth` row (no redeploy). |

GitHub/Vercel automation is kept minimal in the MVP (relies on Vercel's native git integration); a first-class GitHub App is a later phase.

---

## 7. Phased delivery

### Phase 0 — Foundations
- Monorepo/package layout: `packages/app` (Next.js), `packages/cli`, shared `packages/db` (Drizzle schema + migrations).
- Postgres provisioning, Drizzle migrations, connection pooling for serverless.
- Auth: password hash in DB, login route, session cookie, middleware gate.
- `create-viewport` (init + password + deploy) and Vercel deploy pipeline.
- CI (lint, typecheck, test), basic error tracking.
- Scaffold `CLAUDE.md` recording the stack, the DB/repo persistence boundary, the untrusted-HTML sandbox rule, and build/test/deploy commands — so every future session and teammate starts with this context.

**Exit:** `npx create-viewport` produces a password-protected deployed app shell.

### Phase 1 — MVP: Canvas + Comments
- Filesystem scan → tabs/cards; `/api/sync`.
- Prototype file reader on the **sandboxed prototype origin** with CSP + path validation.
- Canvas UI: tabs, pan/zoom, live iframe cards, drag to reposition (positions persisted to DB).
- Comments: create/list/resolve, pinned to a card, display-name attribution.

**Exit:** a team can deploy, drop in prototypes, compare them side by side, and comment. **This is the first shippable release.**

### Phase 2 — AI + Decisions
- Anthropic integration with streaming.
- Synthesize feedback → suggest changes.
- Generate decision spec & generation spec → **commit markdown to the repo** via Octokit.
- Promote a direction: mark chosen, archive losers, record a `decisions` row.

**Exit:** the full "collect → synthesize → decide → document" loop works end to end.

### Phase 3 — Integrations & polish
- GitHub App (replace PAT), webhook-driven sync on push.
- Figma / Loveable / v0 import.
- MCP integration for external tool sync.
- Per-variant voting & structured review; realtime comment updates (e.g. Postgres LISTEN/NOTIFY or Supabase-style channel); canvas branching.

---

## 8. Cross-cutting concerns

- **Security:** untrusted-HTML isolation (separate origin + sandbox + CSP) is the top priority; also CSRF protection on mutating routes, rate limiting on AI and auth routes, secret hygiene (API key, GitHub token).
- **Testing:** unit tests for sync/path-validation/AI prompt assembly; integration tests for API routes against a test DB; a smoke test that scaffolds → deploys → renders a sample prototype.
- **Observability:** structured logs on API routes, error tracking, and cost/latency logging on AI calls.
- **Performance:** lazy-load / virtualize off-screen iframe cards; cache the prototype file listing; stream AI responses.
- **Migrations:** Drizzle migrations run on deploy; schema changes are additive where possible.

---

## 9. Key risks & open questions

| Risk / question | Impact | Proposed handling |
|---|---|---|
| Untrusted prototype HTML escaping the sandbox | High (auth/data exposure) | Separate origin + strict sandbox/CSP; security review before Phase 1 ships. |
| Many heavy live iframes on one canvas | Perf/memory | Virtualize; render iframes only when near viewport; optional screenshot fallback. |
| GitHub write auth (PAT vs App) | Security/UX | Start with a scoped PAT in Phase 2; move to a GitHub App in Phase 3. |
| Serverless DB connection limits | Reliability | Use a pooled/serverless Postgres driver (Neon serverless or PgBouncer). |
| `set-password` "no redeploy" claim | Correctness | Satisfied by storing the hash in the DB (read at runtime), not an env var. |
| Multi-user comment freshness in MVP | UX | MVP uses polling/refetch; realtime channels deferred to Phase 3. |

---

## 10. Deviations from the brief (intentional)

- **Canvas state moves from `.viewport/state.json` to the DB.** Layout/positions are multi-user and change constantly; keeping them in the repo would create commit noise and merge conflicts. The repo remains the source of truth for **decisions and specs**, which is where "travels with the repo" actually matters.
- **Raw comments are never committed to the repo** — only synthesized markdown artifacts are. This is the crisp version of the "hybrid" persistence model.
