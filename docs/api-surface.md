# Viewport — API Route Surface

> The HTTP contract between the canvas UI, the CLI, and the backend. Every route, its origin, its auth requirement, payload, and response. This is the layer that sits on top of the [data model](./data-model.md) and the [two origins](./prototype-sandbox.md).

Companion to [`../TECHNICAL_PLAN.md`](../TECHNICAL_PLAN.md) §2. All routes are Next.js App Router route handlers (`app/api/**/route.ts`), except the prototype-serving routes, which live on the **prototype origin**.

---

## 1. Conventions

- **Format:** JSON in, JSON out, except AI routes (streamed text) and prototype routes (raw files). Bodies are `application/json`; responses include `application/json` unless noted.
- **IDs:** all resource ids are UUIDs (see the data model).
- **Errors:** uniform shape `{ "error": { "code": "string", "message": "human text" } }` with an appropriate HTTP status. Codes are stable strings (`unauthorized`, `not_found`, `validation_failed`, `rate_limited`, `conflict`, `upstream_ai_error`, `git_commit_failed`).
- **Time:** ISO-8601 UTC strings.
- **Pagination:** list endpoints that can grow (comments, syntheses) use cursor pagination: `?cursor=&limit=` → `{ items, nextCursor }`.
- **Validation:** request bodies validated with Zod at the handler boundary; failures return `422 validation_failed` with field details.

### Auth model (three caller types)

| Caller | Credential | Used for |
|---|---|---|
| **Reviewer** (browser) | Session cookie on the app origin (see [sandbox §5](./prototype-sandbox.md)) | All interactive app routes. |
| **Machine** (CLI / deploy hook) | `Authorization: Bearer <VIEWPORT_ADMIN_TOKEN>` | `sync`, `setup`, `set-password`. |
| **Prototype iframe** | Proto-origin cookie minted via the ticket handshake | Serving prototype files only. |

- **Middleware** gates the app origin: everything under `/api/**` and app pages require a valid session cookie, except `/api/auth/login`, `/api/setup`, and the `Bearer`-authenticated machine routes.
- **CSRF:** mutating app routes (`POST/PATCH/DELETE`) require a custom `X-Viewport-CSRF: 1` header. Combined with the `SameSite=Lax` cookie, this blocks cross-site form/`fetch` forgery (a cross-site request can't set custom headers without a CORS preflight the app never allows).
- **Rate limiting:** login (per IP), and all AI routes (per session), backed by a small counter table / KV. Exceeding returns `429 rate_limited` with `Retry-After`.

---

## 2. App origin — Auth & setup

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `POST` | `/api/setup` | Machine (setup token, one-time) | `{ name, repoUrl, password }` | Creates the `projects` + `auth` rows. `409 conflict` if already set up. |
| `POST` | `/api/auth/login` | none | `{ password, displayName }` | Verifies password (argon2), sets host-only session cookie, returns `{ displayName }`. `429` on brute force. |
| `POST` | `/api/auth/logout` | Reviewer | — | Clears the session cookie. |
| `GET`  | `/api/auth/session` | Reviewer | — | `{ authenticated, displayName }` — used by the UI to hydrate identity. |
| `POST` | `/api/auth/password` | Machine **or** Reviewer | `{ password }` | Rotates the `auth` row hash. **No redeploy** (read at runtime). Backs `viewport set-password`. |

---

## 3. App origin — Sync & config

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `POST` | `/api/sync` | Machine or Reviewer | — | Runs the reconciliation algorithm ([data model §3](./data-model.md)). Returns `{ tabs: n, added: [], archived: [], updated: [] }`. Idempotent; safe on every deploy. Backs `viewport sync` and the Vercel post-deploy hook. |
| `GET`  | `/api/config` | Reviewer | — | Non-secret config: `{ protoOrigin, aiModel, features: { strictEgressCSP, perPrototypeSubdomain } }`. Never returns the AI key or admin token. |

---

## 4. App origin — Tabs, prototypes, canvas

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `GET`   | `/api/tabs` | Reviewer | — | `[{ id, slug, name, sortOrder, activeCount }]`, ordered by `sortOrder`. |
| `PATCH` | `/api/tabs/:tabId` | Reviewer | `{ name?, sortOrder? }` | Rename / reorder a tab. |
| `GET`   | `/api/tabs/:tabId/prototypes` | Reviewer | `?status=active\|archived\|all` | Cards for the tab with canvas layout + `commentCount`: `[{ id, variant, title, status, canvasX, canvasY, width, height, zIndex, commentCount }]`. |
| `GET`   | `/api/prototypes/:id` | Reviewer | — | Single prototype detail. |
| `PATCH` | `/api/prototypes/:id` | Reviewer | `{ canvasX?, canvasY?, width?, height?, zIndex?, title? }` | Persist a drag/resize/rename. Partial. |
| `PATCH` | `/api/tabs/:tabId/layout` | Reviewer | `{ updates: [{ id, canvasX, canvasY, zIndex }] }` | **Batch** layout write — one request for a multi-card drag, avoids a PATCH storm. |
| `POST`  | `/api/prototypes/:id/embed` | Reviewer | — | Mints a short-lived signed **ticket** and returns `{ src }` — the iframe URL on the prototype origin ([sandbox §5](./prototype-sandbox.md)). Called as the canvas renders each card. |

> Prototypes are never created or deleted through the API — they appear and archive only via `/api/sync` from the repo filesystem (the repo is the source of truth for prototype *existence*).

---

## 5. App origin — Comments

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `GET`    | `/api/prototypes/:id/comments` | Reviewer | `?cursor=&limit=&resolved=` | Threaded list: top-level comments each with `replies[]`. |
| `POST`   | `/api/prototypes/:id/comments` | Reviewer | `{ body, pinX?, pinY?, parentId? }` | Creates a comment (author = session display name). `pinX/pinY` omitted ⇒ card-level; `parentId` set ⇒ reply. |
| `PATCH`  | `/api/comments/:id` | Reviewer | `{ body?, resolved? }` | Edit body (author only) or toggle resolved (any reviewer; stamps `resolvedBy`/`resolvedAt`). |
| `DELETE` | `/api/comments/:id` | Reviewer | — | Delete (author only). Replies cascade. |

---

## 6. App origin — AI (syntheses & specs)

All AI routes **stream** the model output as `text/event-stream` for live UX, and **persist** a `syntheses` row (with `input_snapshot`, `model`, token counts) once the stream completes. They accept an optional `Idempotency-Key` header so a retried request doesn't double-spend. Full prompt/streaming design lives in the AI section of the plan (next doc).

| Method | Path | Auth | Body | Behavior |
|---|---|---|---|---|
| `POST` | `/api/ai/synthesize` | Reviewer | `{ targetType: 'prototype'\|'tab', targetId }` | Summarizes all comments on the target → streams; persists `kind='synthesis'`. |
| `POST` | `/api/ai/suggest` | Reviewer | `{ synthesisId }` | Prioritized change list from a prior synthesis → streams; persists `kind='suggestions'`. |
| `POST` | `/api/ai/decision-spec` | Reviewer | `{ tabId, chosenPrototypeId, rationale }` | Generates the decision markdown → streams; on completion **commits the doc to the repo** via Octokit, creates a `decisions` row, and archives the losing variants. Returns `{ synthesisId, decisionId, docPath, committedSha }`. `502 git_commit_failed` rolls back the decision row if the commit fails. |
| `POST` | `/api/ai/generation-spec` | Reviewer | `{ targetType, targetId, direction? }` | Brief for the next prototype round → streams; persists `kind='generation_spec'`; `?commit=true` optionally writes it to the repo. |
| `GET`  | `/api/syntheses` | Reviewer | `?targetType=&targetId=&kind=&cursor=` | History of AI outputs for a target. |
| `GET`  | `/api/syntheses/:id` | Reviewer | — | A single stored output (markdown + snapshot + model). |

---

## 7. App origin — Decisions

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `GET`  | `/api/tabs/:tabId/decisions` | Reviewer | — | Decision history for a tab: `[{ id, chosenPrototypeId, rationale, docPath, committedSha, createdAt }]`. |
| `GET`  | `/api/decisions/:id` | Reviewer | — | Single decision detail. |
| `POST` | `/api/decisions` | Reviewer | `{ tabId, chosenPrototypeId, rationale }` | **Manual promote without AI** — records the decision and archives losers, but does not generate/commit a doc. (The AI path in §6 is the usual route.) |

---

## 8. Prototype origin — file serving

Separate origin, own cookie, no access to the app session. See [sandbox §5–6](./prototype-sandbox.md).

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `GET` | `/auth?ticket=<jwt>` | Signed single-use ticket | Verifies the ticket, sets a host-only proto-origin cookie, `302` → `/p/:prototypeId/` (dropping the ticket from the URL). |
| `GET` | `/p/:prototypeId/` | Proto cookie | Serves the variant's `index.html`. |
| `GET` | `/p/:prototypeId/*path` | Proto cookie | Serves an asset within the variant folder, path-validated (no traversal). `404` outside the variant. |

All responses on this origin carry the prototype-origin headers (`frame-ancestors`, `sandbox`, `nosniff`, `Referrer-Policy`) from [sandbox §4](./prototype-sandbox.md).

---

## 9. Two key flows

**Rendering a card (iframe embed):**
```
Canvas mounts card
  → POST /api/prototypes/:id/embed        (app origin, session cookie)
  ← { src: "https://proto.../auth?ticket=<jwt>" }
  → <iframe src=...>  hits proto origin /auth
  → 302 sets proto cookie → /p/:id/       (prototype renders, sandboxed)
```

**Synthesize → decide → document:**
```
POST /api/ai/synthesize   → stream summary, persist synthesis
POST /api/ai/suggest      → stream changes (optional)
POST /api/ai/decision-spec→ stream doc, commit markdown to repo,
                            create decision, archive losing variants
```

---

## 10. Route inventory (at a glance)

```
App origin
  POST   /api/setup                         machine
  POST   /api/auth/login                    public
  POST   /api/auth/logout                   reviewer
  GET    /api/auth/session                  reviewer
  POST   /api/auth/password                 machine|reviewer
  POST   /api/sync                          machine|reviewer
  GET    /api/config                        reviewer
  GET    /api/tabs                          reviewer
  PATCH  /api/tabs/:tabId                    reviewer
  GET    /api/tabs/:tabId/prototypes         reviewer
  PATCH  /api/tabs/:tabId/layout             reviewer
  GET    /api/tabs/:tabId/decisions          reviewer
  GET    /api/prototypes/:id                 reviewer
  PATCH  /api/prototypes/:id                 reviewer
  POST   /api/prototypes/:id/embed           reviewer
  GET    /api/prototypes/:id/comments        reviewer
  POST   /api/prototypes/:id/comments        reviewer
  PATCH  /api/comments/:id                    reviewer
  DELETE /api/comments/:id                    reviewer
  POST   /api/ai/synthesize                  reviewer
  POST   /api/ai/suggest                     reviewer
  POST   /api/ai/decision-spec               reviewer
  POST   /api/ai/generation-spec             reviewer
  GET    /api/syntheses                      reviewer
  GET    /api/syntheses/:id                   reviewer
  POST   /api/decisions                      reviewer
  GET    /api/decisions/:id                   reviewer

Prototype origin
  GET    /auth                               ticket
  GET    /p/:prototypeId/*                    proto cookie
```
