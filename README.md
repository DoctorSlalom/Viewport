# Viewport

> Review prototypes side by side. Collect feedback. Ship decisions. Lives in your repo, deploys to the web.

Viewport is a collaborative prototype canvas for cross-functional teams. Initialize it in any repo with a single CLI command and get a live, password-protected web app where your team can collect prototypes from any source, compare them side by side, synthesize feedback with AI, and generate decision documents — all backed by your repo as the source of truth.

---

## Why Viewport

Modern teams can generate prototypes faster than ever. The problem is what happens next. Prototypes end up scattered across Loveable projects, Claude artifacts, Figma files, and local branches — with no shared place to see them together, collect structured feedback, or carry decisions forward.

Viewport fills that gap. It's not a code generator and it's not a design tool. It's the canvas that sits between generation and development, where your team makes decisions and documents them.

---

## How It Works

```
Generate → Collect → Compare → Decide → Document → Continue
```

1. **Initialize** — run `npx create-viewport` in your repo. Viewport scaffolds a folder structure, configures the canvas, and deploys a live instance to Vercel.
2. **Contribute** — drop prototype files into the repo. Works with output from Loveable, Claude, Figma, or hand-written code. No special tooling required.
3. **Review** — the canvas organizes prototypes into tabs by folder. Live, interactive prototypes render side by side on a scrollable canvas.
4. **Collect feedback** — team members leave comments on individual prototypes directly on the canvas.
5. **Synthesize** — use the built-in AI synthesis to summarize comments, generate suggested changes, and produce a spec for the next round.
6. **Decide** — promote a direction. Viewport generates a decision document capturing what was considered, what was chosen, and why. Losing variants are archived, not deleted.
7. **Hand off** — the repo leaves the prototype phase with documented decisions and a clean structure, ready for engineering to continue.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A GitHub repository
- A Vercel account

### Initialize

```bash
npx create-viewport
```

The CLI will:

- Scaffold the Viewport folder structure in your repo
- Prompt for a team password
- Deploy a live instance to Vercel
- Output a shareable URL

That's it. Share the URL and password with your team.

---

## Repo Structure

After initialization, your repo will contain:

```
your-project/
├── .viewport/
│   └── state.json          ← canvas layout, card positions, tab config
├── prototypes/
│   ├── _template/          ← blank prototype scaffold
│   └── [feature-name]/     ← one folder per canvas tab
│       ├── variant-a/
│       ├── variant-b/
│       └── variant-c/
├── decisions/              ← auto-generated decision documents
├── assets/                 ← shared tokens, images, references
├── viewport.config.json    ← deployment and integration settings
└── README.md
```

Folders inside `prototypes/` map directly to tabs on the canvas. Add a folder, get a tab. The `.viewport/` directory is version-controlled — canvas state travels with the repo.

---

## Contributing Prototypes

Anyone on the team can contribute a prototype by adding files to the appropriate folder under `prototypes/` and pushing to the repo. Viewport picks up the change on the next canvas sync.

Prototypes can come from anywhere:

- **Loveable / v0** — export and drop the generated files into a variant folder
- **Claude Artifacts** — copy the generated code into `index.html` in a variant folder
- **Figma** — export frames as references or use the Figma integration (see Integrations)
- **Hand-written code** — add your files directly; any folder with an `index.html` renders as a canvas card

### Minimum prototype structure

```
prototypes/homepage/variant-a/
└── index.html
```

Self-contained HTML files render immediately. For multi-file prototypes, include all assets within the variant folder.

---

## The Canvas

The canvas is the primary interface. Each prototype renders as a live, interactive card. Cards are organized into tabs by folder and arranged on a scrollable surface so you can pan across variants and compare them in context.

**What you can do on the canvas:**

- Pan and scroll across all variants in a tab
- View prototypes in a live, interactive iframe — not screenshots
- Leave comments on individual prototypes
- See all team feedback collected in one place
- Trigger AI synthesis on any prototype's comments
- Generate suggested changes, specs, and decision documents

---

## AI Features

Viewport uses an LLM to help teams move from feedback to action.

| Feature | What it does |
|---|---|
| **Synthesize feedback** | Summarizes all comments on a prototype into a coherent signal |
| **Suggest changes** | Generates a prioritized list of changes based on synthesized feedback |
| **Generate decision spec** | Documents what was considered, what was chosen, and why |
| **Generate generation spec** | Produces a brief for the next prototype round, ready to paste into any AI platform |

---

## Access & Security

Viewport is protected by a single shared team password set during initialization. No individual accounts required.

To rotate the password:

```bash
npx viewport set-password
```

This updates the environment variable on Vercel without requiring a redeployment.

Each Viewport deployment is isolated to its repo and project. There is no shared infrastructure between projects.

---

## Integrations

Viewport is an orchestration layer. It receives work from wherever it was made.

| Integration | Status |
|---|---|
| GitHub | ✓ Available — repo sync, canvas refresh on push |
| Vercel | ✓ Available — deployment via CLI |
| Loveable | Planned |
| Figma | Planned |
| MCP (external tools) | Planned |

---

## Deployment

Viewport deploys to Vercel by default. Each project is its own isolated deployment.

The CLI handles initial deployment. To redeploy manually:

```bash
npx viewport deploy
```

To sync the canvas with the latest repo state:

```bash
npx viewport sync
```

Or configure automatic sync on push via the GitHub webhook in `viewport.config.json`.

---

## Roadmap

- [x] CLI initialization and Vercel deployment
- [x] Folder-to-tab canvas structure
- [x] Live prototype rendering
- [x] Canvas comments
- [x] AI feedback synthesis
- [x] Decision document generation
- [ ] Figma integration
- [ ] Loveable / v0 import
- [ ] MCP integration for external tool sync
- [ ] GitHub App (replacing personal access token)
- [ ] Per-variant voting and structured review
- [ ] Canvas branching

---

## License

MIT
