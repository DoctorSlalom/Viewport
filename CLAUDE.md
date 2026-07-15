# Viewport — CLAUDE.md

This is the Viewport monorepo. Read this before touching any code.

## What this is

A collaborative prototype-review canvas that deploys to Vercel. Teams drop HTML prototypes into `prototypes/`, then compare, comment on, and decide between them via a live canvas UI. An AI layer synthesizes feedback and generates decision docs that commit back to the repo.

## Monorepo layout

```
packages/
  app/    — Next.js 15 App Router (the deployed web app)
  cli/    — `viewport` and `create-viewport` CLIs (Node ESM)
  db/     — Drizzle ORM schema + Neon client (shared between app and cli)
```

Root tooling: **pnpm workspaces** + **Turbo**.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Database | Postgres (Neon) via Drizzle ORM |
| Auth | Shared password → argon2id hash in DB → signed httpOnly JWT cookie (jose) |
| AI | Anthropic Claude (`claude-opus-4-8` default, streaming via SSE) |
| Repo writes | Octokit — commit generated markdown via GitHub API |
| CLI | commander + @clack/prompts |
| Deploy | Vercel |

## Persistence boundary — critical

**DB holds:** comments, canvas positions, AI synthesis outputs, decisions metadata.
**Repo holds:** generated markdown artifacts only (`decisions/`, `specs/`).

Raw comments are **never committed** to git. Only synthesized/decided markdown is. Canvas layout lives in the DB (not `state.json`) because it's multi-user and changes constantly — committing it creates noise and merge conflicts.

## Untrusted HTML boundary — critical

Prototypes are arbitrary HTML. They run in a **sandboxed `<iframe>`** on a **separate origin** (`proto.*` subdomain) so they cannot access the app's auth cookie or call its APIs. Never serve prototype files from the same origin as the app. See `docs/prototype-sandbox.md` for the full threat model, CSP, and path-traversal defense.

## Auth model

- Single shared team password. No individual user accounts.
- Hash stored in the `auth` table (single row). Reading from DB at runtime is what makes `set-password` work without a redeploy.
- Display name captured at login, stored in the session JWT.
- Middleware gates all routes except `/login` and `/api/auth/login`.

## Common commands

```bash
# Install deps
pnpm install

# Run the app in dev
pnpm dev                        # all packages via Turbo
cd packages/app && pnpm dev     # just the Next.js app

# Type-check everything
pnpm typecheck

# Lint
pnpm lint

# DB: generate migration SQL from schema changes
cd packages/db && pnpm db:generate

# DB: apply migrations
cd packages/db && pnpm db:migrate

# CLI (after build)
node packages/cli/dist/create.js   # create-viewport
node packages/cli/dist/index.js    # viewport
```

## Env vars

| Var | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | app + db | Neon connection string |
| `SESSION_SECRET` | app | 32+ char secret for JWT signing |
| `VIEWPORT_ADMIN_TOKEN` | app | Bearer token for CLI → admin API calls |
| `ANTHROPIC_API_KEY` | app | Claude API key |
| `GITHUB_TOKEN` | app | GitHub PAT for committing decision docs |

## Data model

Full Drizzle schema is in `packages/db/src/schema.ts`. Key tables: `projects`, `auth`, `tabs`, `prototypes`, `comments`, `syntheses`, `decisions`. Never hard-delete — use `status = 'archived'` on prototypes.

## Design docs

- `docs/data-model.md` — full schema rationale and sync algorithm
- `docs/api-surface.md` — every HTTP route
- `docs/prototype-sandbox.md` — untrusted HTML isolation design
- `docs/ai-synthesis.md` — prompt architecture, streaming, Octokit commit transaction
