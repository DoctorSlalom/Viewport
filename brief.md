# Prototype Canvas
## Product Brief

**Version:** 1.0  
**Date:** July 2026  
**Status:** Discovery

---

## The Problem

Modern product teams have more ways to generate prototypes than ever — AI platforms like Loveable and Claude, design tools like Figma, and raw code from engineers. But the workflow breaks the moment more than one prototype exists. There's no shared surface to see them together, no structured way to collect feedback across a team, and no mechanism to carry decisions forward into the next round of work.

Teams fall back on screen shares, Slack threads, and shared drives. Decisions get made in meetings and lost afterward. The prototype phase — where the most important early direction-setting happens — leaves almost no durable artifact behind.

The gap isn't generation. It's **collection, comparison, decision-making, and continuity.**

---

## The Opportunity

Tools at the edges of this problem exist but none solve it fully:

| Tool | Canvas | Live Code | Repo-backed | Round-trip docs | Integrations |
|---|---|---|---|---|---|
| Loveable / v0 | — | ✓ | — | — | Limited |
| Figma Make | ✓ | Partial | — | Partial | Limited |
| Claude Artifacts | Partial | ✓ | — | — | — |
| **Prototype Canvas** | **✓** | **✓** | **✓** | **✓** | **✓** |

Figma Make is the closest analog — it offers a canvas, review functionality, and variation management — but it requires expensive seat licenses, has limited adoption outside design-centric teams, and isn't repo-backed. Prototype Canvas targets the same workflow with a lower floor, a broader audience, and the repo as its foundation.

---

## Product Vision

Prototype Canvas is a collaborative review environment that lives in your repo and deploys to the web. It gives cross-functional teams — designers, engineers, product managers, account managers — a shared canvas to collect prototypes from any source, compare them side by side, gather and synthesize feedback, make documented decisions, and hand off cleanly to the next stage of development.

The repo is the source of truth. The canvas is the window into it.

---

## How It Works

### The Core Loop

```
Generate → Collect → Compare → Decide → Document → Continue
```

**1. Initialize with a CLI command**
A single `npx create-prototype-canvas` command scaffolds the repo structure, configures the canvas, and deploys a live, password-protected instance to Vercel. From initialization to a shareable team URL in minutes.

**2. Contribute from anywhere**
Prototypes generated in Loveable, Claude, Figma, or raw code are dropped into the repo folder structure. No special tooling required — copy, paste, push.

**3. Review on a tabbed canvas**
The canvas organizes prototypes into tabs by folder — Homepage, Animations, Onboarding — so teams can focus one area at a time. Within each tab, prototypes render as live, interactive cards on a scrollable canvas, side by side.

**4. Collect and synthesize feedback**
Team members leave comments on individual canvas cards. An LLM synthesizes comments into a coherent summary, surfaces suggested changes, and generates a spec for the next round of work.

**5. Decide and document**
When the team reaches a decision, the tool generates a decision document capturing what was considered, what was chosen, and why. Losing variants are archived with context intact, not deleted.

**6. Hand off and continue**
The promoted variant becomes the baseline. The repo — with its documented decisions, clean folder structure, and canvas history — is ready for engineering to continue, with MCP integration for ongoing work in external tools.

---

## Users

| Role | How They Use It |
|---|---|
| **Design/Engineering Lead** | Initializes and manages the canvas; owns the repo structure; promotes decisions |
| **Designer** | Generates prototypes in external tools, contributes to the repo, reviews and annotates on canvas |
| **Engineer** | Contributes code-based prototypes, pulls the repo, accesses prototype files directly |
| **Product Manager** | Reviews variants, leaves structured feedback, generates specs and decision docs |
| **Account Manager** | Reviews options, leaves feedback, exports summaries for client communication |

All roles can generate prototypes in external platforms and contribute them via the repo. All roles can access the deployed canvas with the shared team password.

---

## Deployment Model

- **Initiated by CLI:** `npx create-prototype-canvas` scaffolds the repo and wires Vercel deployment in a single flow
- **Per-project isolation:** each project gets its own Vercel deployment, independent of any other team or project
- **Shared password:** the deployed canvas is protected by a single team password — low friction, no individual account setup required
- **Repo as source of truth:** the canvas reads from the repo; changes pushed to the repo are reflected in the canvas via sync

---

## Repo Structure

```
my-project/
├── .canvas/
│   └── state.json          ← canvas layout, card positions, tab config
├── prototypes/
│   ├── _template/          ← blank variant scaffold
│   └── homepage/           ← one folder per canvas tab
│       ├── v1-minimal/
│       ├── v2-bold/
│       └── v3-animated/
├── decisions/              ← auto-generated decision documents
├── assets/                 ← shared design tokens, images
├── canvas.config.json      ← integration settings (GitHub, Vercel, etc.)
└── README.md               ← generated project brief
```

The `.canvas/` folder makes canvas state version-controlled. Folders under `prototypes/` map directly to canvas tabs. Teams can branch the canvas itself.

---

## Integrations

The canvas is an orchestration layer, not a code generator. It receives work from wherever it was made:

- **GitHub** — repo sync, branch mapping, PR handoff
- **Loveable / AI platforms** — import generated projects into the repo structure
- **Figma** — import design frames as reference cards
- **MCP** — ongoing integration for external tools as development continues post-prototype phase

---

## Jobs to Be Done

### Phase 0: Initiate & Deploy

**JTBD-00a** — When I want to start using Prototype Canvas on a new project, I want to run a single CLI command in my repo, so the canvas scaffolding, config, and baseline folder structure are set up automatically without manual configuration.

**JTBD-00b** — When my canvas is initialized, I want to deploy it to Vercel as an isolated instance tied to this specific repo, so my project's canvas doesn't mix with or depend on any other team's project.

**JTBD-00c** — When the canvas is deployed and live, I want it gated behind a single shared password, so my team can access it easily without individual account setup, while keeping it inaccessible to outside parties.

**JTBD-00d** — When I'm setting up the project, I want the CLI to handle Vercel deployment as part of the same flow, so I don't need separate manual steps to get from "initialized" to "live and shareable."

**JTBD-00e** — When the shared password needs to change, I want to rotate it without redeploying or reconfiguring the whole project, so access management stays lightweight.

---

### Phase 1: Contribute & Set Up

**JTBD-01** — When our team has generated prototypes across different tools and platforms, I want to bring them into a single shared surface, so I can see what we actually have before we start making decisions.

**JTBD-02** — When I've generated a prototype in an external tool, I want to copy and paste or drop my generated files into the repo structure, so I can contribute to the canvas without needing special access or technical setup.

**JTBD-03** — When I join a project mid-stream, I want to understand what directions have already been explored and why, so I can contribute without retreading old ground.

**JTBD-04** — When prototypes come from different sources and formats, I want to normalize them into a comparable structure, so they can be reviewed on equal terms on the canvas.

**JTBD-05** — When a design or engineering lead sets up a new project, I want to initialize a baseline repo structure with the right folders for prototypes, decisions, and assets, so the team has a consistent place to contribute from day one.

---

### Phase 2: Browse & Navigate

**JTBD-06** — When a repository contains prototypes for multiple areas of a product, I want to navigate between tabbed canvases organized by folder, so I can focus my review on one area at a time without losing sight of the whole.

**JTBD-07** — When a project has evolved over time, I want to access prototype files organized by version or iteration round within a folder, so I can understand the history of a specific area without digging through the full repo.

**JTBD-08** — When I want to explore what's available, I want to browse prototype files directly from the folder structure in the repo, so I can find and load a specific prototype onto the canvas myself.

---

### Phase 3: Compare & Review

**JTBD-09** — When my team is evaluating multiple variants, I want to view them side by side in a live, interactive state on a scrollable canvas, so I can experience actual UX differences rather than looking at static screenshots.

**JTBD-10** — When I'm reviewing a prototype, I want to leave a comment tied to a specific prototype on the canvas, so my feedback is attached to the artifact and not lost in a separate thread.

**JTBD-11** — When I have a strong opinion about a direction, I want to leave structured feedback tied to a specific variant, so my reasoning is captured alongside the artifact and visible to the whole team.

**JTBD-12** — When two variants solve the same problem differently, I want to annotate the specific elements or interactions where they diverge, so the team can discuss the actual tradeoff rather than reacting to overall aesthetics.

**JTBD-13** — When stakeholders are reviewing options, I want to surface which variant has the most support and what the key concerns are, so I can facilitate a decision without needing to run a synchronous meeting.

---

### Phase 4: Synthesize & Specify

**JTBD-14** — When a prototype has accumulated comments from multiple reviewers, I want to use an LLM to synthesize that feedback into a coherent summary, so I can see the signal across all the noise quickly.

**JTBD-15** — When feedback has been synthesized, I want to generate a list of suggested changes to a specific prototype based on that feedback, so contributors know exactly what to act on.

**JTBD-16** — When the team has reached alignment on a direction, I want to generate a specification document based on the accumulated comments and decisions, so the spec reflects the actual conversation rather than being written from scratch.

**JTBD-17** — When we're ready for the next round of work, I want to create a new prototype spec that consolidates all feedback into a single brief, so any team member or AI platform can use it to generate the next version.

---

### Phase 5: Iterate & Refresh

**JTBD-18** — When changes have been made to prototype files in the repo, I want to refresh the canvas to reflect the latest versions, so the canvas always shows what's current and not a stale snapshot.

**JTBD-19** — When a new round of iteration begins, I want to fork an existing canvas card into new variants, so the lineage of what we built from is preserved while we explore new directions.

**JTBD-20** — When work continues in external tools, I want those updates to flow back into the canvas via the repo, so the canvas remains the shared source of truth.

---

### Phase 6: Decide & Document

**JTBD-21** — When the team reaches a decision, I want to automatically generate a decision document that captures what was considered, what was chosen, and why, so we have a record that survives the project handoff.

**JTBD-22** — When a variant is promoted, I want the losing variants archived with their context intact, so we can revisit them if the chosen direction doesn't work out.

**JTBD-23** — When I need to communicate a decision to someone outside the team, I want to export a readable summary with visual references, so they can understand the outcome without needing access to the tool.

---

### Phase 7: Hand Off & Continue

**JTBD-24** — When the prototype phase ends and engineering takes over, I want to hand off a repo with documented decisions and a clean folder structure, so there's no ambiguity about what was decided or where to start.

**JTBD-25** — When a new team member joins, I want to share the canvas history as a living brief, so they can see not just what was built but how the team got there.

**JTBD-26** — When development continues beyond the canvas, I want the repo structure to support ongoing work in external tools and AI platforms via MCP, so the repo remains the source of truth as the project matures.

---

## Open Questions

These are decisions that will shape architecture and UX and should be resolved before significant build begins.

**Identity under shared password** — Comments need attribution, but there's no individual login. Likely solution: prompt for a display name on first visit, stored in a cookie. Worth confirming this is sufficient for the target team size and trust model.

**Repo sync mechanism** — The deployed Vercel app needs to read repo contents. Options are a personal access token (simple), a deploy key (per-repo), or a GitHub App (best long-term experience). The CLI init flow determines which path gets built first.

**Canvas refresh trigger** — Should the canvas update automatically on every repo push (via GitHub webhook) or on-demand via a manual sync action? Automatic is better UX; manual is simpler to build and more predictable.

**Spec output distinction** — Two spec types emerge from the feedback: a decision spec (looking backward — what was chosen and why) and a generation spec (looking forward — a brief for the next prototype round). These should be distinct exports in the UX to avoid conflating documentation with direction.

**GitHub App vs. token for long-term integration** — For teams that want MCP integration and ongoing repo sync, a GitHub App installation is the right foundation. A personal access token is acceptable for early versions. This decision affects how much auth infrastructure needs to be built into the CLI.
