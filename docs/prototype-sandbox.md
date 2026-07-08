# Viewport — Sandboxed Prototype Origin

> How Viewport serves and isolates untrusted prototype HTML. This is the security linchpin of the whole product: everything else assumes this boundary holds.

Companion to [`../TECHNICAL_PLAN.md`](../TECHNICAL_PLAN.md) §2.2.

---

## 1. Threat model

Prototypes are **arbitrary HTML/CSS/JS dropped into the repo by team members** and rendered live in every reviewer's browser. Treat every prototype as hostile code — even if authored in good faith, it can carry a copy-pasted script, a compromised dependency, or a mistake. Concretely, prototype JavaScript must **not** be able to:

1. **Steal the session** — read the Viewport app's auth cookie or `localStorage`.
2. **Act as the user** — call the app's authenticated APIs (post comments, promote decisions, trigger AI spend) using the reviewer's session.
3. **Phish** — navigate or overlay the top-level window to fake a Viewport login.
4. **Cross-contaminate** — read another prototype's DOM, storage, or state.
5. **Escalate to the app origin** — execute in the app's origin (stored XSS).

Two things are explicitly **out of scope** for the sandbox and handled elsewhere (see §8): a prototype burning CPU in the viewer's tab, and a prototype exfiltrating data it was *given* over the network.

---

## 2. Core principle: a separate origin does the heavy lifting

The Same-Origin Policy is the real boundary — not the `sandbox` attribute alone. Prototype content is served from a **different origin than the app**, so the browser structurally prevents prototype scripts from touching the app's cookies, storage, DOM, or same-origin APIs. The `sandbox` attribute and response headers are **defense-in-depth layered on top**, not the primary control.

```
  app origin                              prototype origin
  viewport.example.com                    proto.viewport.example.com
  ─────────────────────                   ──────────────────────────
  • auth cookie (HOST-ONLY)               • serves prototypes/**  only
  • canvas UI + APIs                      • its own short-lived cookie
  • session, AI, decisions                • no access to app cookie/DOM
        │                                        ▲
        │  renders each card as ───────►  <iframe sandbox> pointing here
        │  a cross-origin sandboxed iframe
```

**Cookie discipline is mandatory.** The app session cookie is set **host-only** (no `Domain=` attribute), so it is *never* sent to `proto.` or any other subdomain. Setting `Domain=.example.com` anywhere would silently defeat the entire boundary — this is the single easiest way to break isolation, so it's called out in code review and tests.

### Domain strategy (two tiers)

| Tier | Layout | Isolation | When |
|---|---|---|---|
| **MVP** | Shared subdomain `proto.viewport.example.com`, every prototype in a sandboxed iframe forced to an **opaque origin** (no `allow-same-origin`) | Prototypes are isolated from the app and — because each opaque origin is unique — from *each other* too. No shared storage. | Default. |
| **Strong** | Per-prototype subdomain `{id}.proto.viewport.example.com` (or a separate registrable domain) | Full Site isolation; prototypes that legitimately need `localStorage`/same-origin `fetch` can have it without sharing it. | Later, if prototypes need real storage/origin features. |

> A **separate registrable domain** (e.g. `viewport-proto.app`, not a subdomain) is the gold standard: it removes any chance of a `Domain=` cookie mistake bridging the two and gives full browser Site Isolation. Recommended for production; a subdomain is acceptable for the MVP given host-only cookies.

---

## 3. The iframe

Each canvas card embeds its prototype like this:

```html
<iframe
  src="https://proto.viewport.example.com/p/{prototypeId}/"
  sandbox="allow-scripts allow-forms"
  referrerpolicy="no-referrer"
  loading="lazy"
  title="{prototype title}"
></iframe>
```

**Why exactly these `sandbox` tokens — and why the omissions matter more:**

| Token | Included? | Reason |
|---|---|---|
| `allow-scripts` | ✅ | Prototypes must be interactive (the brief: "live, not screenshots"). |
| `allow-forms` | ✅ | Forms are common in UI prototypes and harmless within the sandbox. |
| `allow-same-origin` | ❌ **omitted** | Omitting it forces the frame into a **unique opaque origin** → no cookies, no `localStorage`, no reading its own origin. This is what makes prototype-to-prototype isolation automatic. **Never combine `allow-scripts` + `allow-same-origin` for untrusted content** — together they let the frame reach same-origin state and potentially remove its own sandbox. |
| `allow-top-navigation*` | ❌ | Prevents the prototype from navigating the top window to a phishing page. |
| `allow-popups` | ❌ | No new windows/tabs. |
| `allow-modals` | ❌ | No `alert`/`prompt` hijacking of the reviewer. |
| `allow-downloads` | ❌ | No drive-by downloads. |
| `allow-pointer-lock` / `allow-presentation` | ❌ | Not needed; deny by default. |

Trade-off of the opaque origin: a prototype that uses `fetch()`/`localStorage` against *its own* origin won't work in the MVP tier (the origin is `null`). Self-contained prototypes (assets via `<img>/<link>/<script>` tags) render fine. Prototypes needing real storage move to the **Strong** tier's per-prototype subdomain. Default is safety.

---

## 4. Response headers

### On the prototype origin (every prototype response)

```
Content-Security-Policy: frame-ancestors https://viewport.example.com; sandbox allow-scripts allow-forms;
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-site
```

- **`frame-ancestors`** — the prototype can *only* be embedded by the Viewport app, so it can't be lifted into a clickjacking page elsewhere.
- **`sandbox` in CSP** — a second, header-level sandbox that a prototype can't strip by manipulating the DOM, mirroring the iframe attribute.
- **`nosniff`** — the browser won't MIME-sniff a served asset into something executable in a surprising context.

### On the app origin (authenticated pages)

```
Content-Security-Policy: frame-ancestors 'none'; frame-src https://proto.viewport.example.com; default-src 'self'; ...
Cross-Origin-Opener-Policy: same-origin
```

- **`frame-ancestors 'none'`** — the app can never be framed (a prototype can't frame the login page to overlay/clickjack it).
- **`frame-src`** — the app may only embed iframes from the prototype origin.
- **`COOP: same-origin`** — isolates the app's browsing-context group from anything it opens.

> Note the CSP tension: we deliberately do **not** lock down `connect-src`/`script-src` on prototype content by default, because prototypes are arbitrary and a strict policy would break legitimate ones (external fonts, CDNs, API calls). Egress restriction is an **opt-in tightening** (§8), not a default — the origin boundary, not CSP, is what protects the app.

---

## 5. Authenticating the prototype origin

Prototypes are private (this is an internal review tool), so the prototype origin must also require the team password — but it can't share the app's host-only cookie. We bridge the two origins with a **short-lived, single-use ticket handshake** so no long-lived credential ever lands in a URL:

```
1. Reviewer is logged in on the app origin (app session cookie present).
2. App renders a card → mints a signed ticket:
     { aud: "proto", prototypeId, sid, exp: now+60s, jti }  (HS256, single-use)
3. iframe src → https://proto.../auth?ticket=<jwt>
4. Prototype origin /auth handler:
     - verifies signature, aud, exp; checks jti not already used
     - sets a HOST-ONLY, httpOnly, SameSite=Lax cookie on the proto origin
     - 302 → /p/{prototypeId}/   (drops the ticket from the URL)
5. Subsequent asset loads carry the proto-origin cookie. No token in history/referrer.
```

The proto cookie is read-only in scope: it authorizes *serving prototype files*, nothing else. It never grants access to comments, AI, or decisions — those live only behind the app cookie on the app origin.

---

## 6. The file reader (path-traversal defense)

The handler that serves `prototypes/**` from the deployment bundle must refuse to escape a variant folder. Resolve and re-check every request against a canonical base:

```ts
import path from 'node:path';

const PROTO_ROOT = path.resolve(process.cwd(), 'prototypes');

/** Map a prototype id + requested asset path to a safe absolute file path, or null. */
function resolvePrototypeAsset(variantDir: string, requested: string): string | null {
  // variantDir is a trusted repo-relative path from the DB (e.g. prototypes/homepage/variant-a)
  const base = path.resolve(PROTO_ROOT, path.relative('prototypes', variantDir));
  const target = path.resolve(base, requested || 'index.html');

  // Reject anything that escapes the variant folder (handles ../, absolute paths, etc.)
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;

  return target;
}
```

Additional rules:
- Only paths **inside `prototypes/`** are ever served; `.viewport/`, `decisions/`, `assets/`, and app source are never reachable through this handler.
- Deny following symlinks that resolve outside `PROTO_ROOT` (verify the real path after `realpath`).
- Default document is `index.html`; a variant with no `index.html` renders no card (matches the sync rule).
- Set correct `Content-Type` from the extension; unknown types are served as `application/octet-stream` with `nosniff`.

---

## 7. What this buys us (mapped to the threat model)

| Threat | Neutralized by |
|---|---|
| Steal session cookie | Separate origin + host-only cookie → cookie never reaches prototype origin; opaque frame origin has no cookie access anyway. |
| Call app APIs as the user | Cross-origin + no `allow-same-origin`; app APIs sit behind the app cookie the prototype can't send. |
| Phish via top navigation | `sandbox` omits `allow-top-navigation`; app sets `frame-ancestors 'none'`. |
| Cross-contaminate prototypes | Each frame is a unique opaque origin (MVP) or its own subdomain (Strong). |
| XSS into app origin | Prototype never executes on the app origin; app CSP restricts its own `script-src` to `'self'`. |

---

## 8. Residual risks (documented, not silently ignored)

| Risk | Why the sandbox doesn't stop it | Mitigation |
|---|---|---|
| CPU/memory abuse (infinite loop, miner) in the reviewer's tab | Sandboxing isolates capability, not compute | Lazy-load / virtualize off-screen iframes (perf plan); a "pause" state and screenshot fallback for heavy cards. |
| Network exfiltration of data the prototype already holds | Default CSP intentionally allows egress so real prototypes work | **Opt-in** strict `connect-src`/`script-src` CSP per tab in `viewport.config.json` for sensitive projects, accepting that some prototypes break. |
| Malicious `Domain=` cookie regressions bridging origins | Human error, not a browser gap | Enforced by test: assert the session `Set-Cookie` has no `Domain=` attribute; code-review checklist item. |

---

## 9. Config knobs (`viewport.config.json`)

```jsonc
{
  "sandbox": {
    "protoOrigin": "https://proto.viewport.example.com",
    "perPrototypeSubdomain": false,   // flip to true for the Strong tier
    "strictEgressCSP": false          // opt-in connect-src/script-src lockdown
  }
}
```

---

## 10. Phase mapping

- **Phase 1 (MVP):** separate `proto.` subdomain, opaque-origin sandboxed iframes, host-only cookies, the ticket handshake, file-reader path validation, and both origins' baseline headers. **A security review gates shipping Phase 1** — this boundary is the product's trust anchor.
- **Phase 3+:** per-prototype subdomains / separate registrable domain, opt-in strict egress CSP, and the pause/screenshot fallback for heavy prototypes.
