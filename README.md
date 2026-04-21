# @o7z/zdoc

**English** · [简体中文](./README.zh-CN.md)

Zero-config Markdown docs server. Point `zdoc` at a folder of `.md` files, get a polished docs site with:

- Automatic sidebar driven by `_meta.yaml` files
- Right-side table of contents (h1–h3) with active-section highlight
- Server-side password protection, sessions persisted across restart
- Mermaid diagrams + syntax highlighting
- Dark mode + `Ctrl+K` search
- Responsive layout
- Auto-rendered PDFs

## Quick start

```bash
# From any directory containing Markdown files:
npx @o7z/zdoc
# or install globally:
npm i -g @o7z/zdoc
zdoc
```

By default `zdoc` serves the current directory on port 8888 with **no password** (docs are public). Pass `-w <pwd>` to enable auth.

## CLI

```
zdoc [options]

Options:
  -d, --dir <path>       Markdown docs directory (default: current working directory)
  -p, --port <number>    Port to listen on (default: 8888, auto-increments if busy)
  -t, --title <string>   Site title (default: Docs)
  -w, --password <pwd>   Access password (default: none, docs are public; set to enable auth)
  -h, --help             Show help
  -v, --version          Show version
```

Examples:

```bash
zdoc                                # cwd, port 8888, no password (public)
zdoc -d ./docs -p 3000              # custom dir and port
zdoc -t "My Docs"                   # custom site title
zdoc -w hunter2                     # enable password protection
zdoc -w hunter2 -p 8080 -d ./site   # full override
```

If the chosen port is busy, `zdoc` automatically picks the next available port.

## Configuration (`zdoc.config.json`)

Create a `zdoc.config.json` in the directory where you run `zdoc` to set defaults:

```json
{
  "title": "My Docs",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888
}
```

Precedence: **CLI flags > `zdoc.config.json` > defaults**.

The password is set at boot from CLI / `zdoc.config.json` / `ZDOC_PASSWORD`. There is no in-browser change-password UI — to rotate the password, edit the source and restart.

## Authoring docs

`zdoc` uses a single metadata file per directory: **`_meta.yaml`**. All `.md` files are pure content — no frontmatter, no HTML comments.

### `_meta.yaml`

Every directory that should appear in the sidebar needs a `_meta.yaml`. It declares the directory's own title/order and lists the pages (`.md` and `.pdf`) that should appear in the sidebar.

```yaml
title: Getting Started      # required — sidebar label for the directory
order: 1                     # optional — sort weight (lower = earlier). Default 999
env: prod                    # optional — set to "prod" to hide in non-prod

pages:
  install:                   # key = filename without .md
    title: Install           # required — without this, the file is hidden
    order: 1
    modified: 2026-04-18
    version: 1.0.1
    description: Step-by-step install for npm, bun, and global use.
    author: o7z
  config:
    title: Config
    order: 2
  report.pdf:                # PDFs: use the full filename including extension
    title: Q4 Report
    order: 3
```

Directories without `_meta.yaml` are hidden entirely. `.md` files not listed under `pages` are not routable (404) and don't appear in the sidebar.

### Per-page fields

| Field         | Required | Description                                                              |
|---------------|----------|--------------------------------------------------------------------------|
| `title`       | Yes      | Sidebar label. Omitting it hides the page.                               |
| `order`       | No       | Sort weight. Default `999`.                                              |
| `modified`    | No       | Last-modified string, shown in the page's metadata bar.                  |
| `description` | No       | Short summary, shown above the article body.                             |
| `version`     | No       | Document version (e.g. `1.0.1`), shown as a chip in the metadata bar.    |
| `author`      | No       | Author name, shown as a chip in the metadata bar.                        |
| `env`         | No       | Set to `prod` to hide in development (`NODE_ENV !== 'production'`).      |

`description`, `version`, `author`, and `modified` work for both `.md` and `.pdf` entries; when any of them is set, the page renders a small metadata bar above the content.

### Site home

The docs root renders `<docsDir>/index.md` as the landing page:

- `<docsDir>/_meta.yaml` declares the site title
- `<docsDir>/index.md` is the site home page (pure Markdown, plus the optional hero frontmatter below)

Sidebar directory nodes are expand/collapse only — they do not navigate. If you want a page for a group, add an entry under `pages` in that directory's `_meta.yaml`.

### Example layout

```
docs/
├── _meta.yaml              # title: My Docs
├── index.md                # site home (plain Markdown)
├── getting-started/
│   ├── _meta.yaml          # title: Getting Started; order: 1; pages: {install:…, config:…}
│   ├── install.md          # pure content, listed in _meta.yaml
│   └── config.md
├── guide/
│   ├── _meta.yaml          # title: Guide; order: 2; pages: {basics:…, advanced:…}
│   ├── basics.md
│   └── advanced.md
└── reports/
    ├── _meta.yaml          # title: Reports; order: 3; pages: {Q4.pdf: {title: Q4 Report}}
    └── Q4.pdf
```

### Site-home hero (optional)

`index.md` at the docs root supports a YAML frontmatter hero block:

```markdown
---
name: My Project
text: The fastest way to ship docs
tagline: Zero config, dark mode, Mermaid, search.
actions:
  - theme: brand
    text: Get started
    link: /getting-started/install.md
  - theme: alt
    text: GitHub
    link: https://github.com/…
features:
  - title: Zero config
    details: Drop it into any folder of Markdown.
  - title: Password protected
    details: Server-side session auth, runtime password change.
---

# Welcome

Any Markdown below the frontmatter renders normally.
```

## Features reference

- **Right-side TOC**: Each Markdown page gets an auto-generated table of contents (h1–h3) pinned to the right edge on viewports ≥ 1280px. The currently visible heading is highlighted as you scroll, and clicking an entry smooth-scrolls to that section.
- **Mermaid**: Fenced ```` ```mermaid ```` blocks render as SVG.
- **Syntax highlighting**: `rehype-highlight` with automatic language detection.
- **Search**: Press `Ctrl+K` (Mac: `Cmd+K`) to fuzzy-search sidebar titles.
- **Dark mode**: Auto-detect + manual toggle, persisted to `localStorage`.
- **Password protection**: Server-side HttpOnly session cookie. Omit `-w` or pass `-w ""` to disable. Sessions are persisted in a small SQLite file at `<docsDir>/.zdoc/zdoc.db`, so a logged-in cookie keeps working after a `zdoc` restart. Sessions expire after their 7-day TTL; deleting `<docsDir>/.zdoc/` invalidates everyone.
- **PDFs**: listed in `_meta.yaml` pages, opened in the browser's native PDF viewer via iframe.

## Development (for contributors)

This repo **dogfoods zdoc**: the `docs/` directory IS the official documentation,
and is served by zdoc itself. The `demo/` directory is a separate collection of
intentionally-malformed samples used to stress-test the renderer (long pages,
edge-case `_meta.yaml`, etc.) — not meant for humans to read.

```bash
bun install
bun run dev        # zdoc rendering its own docs/ (the official site)
bun run dev:demo   # zdoc rendering demo/ (regression samples only)
bun run dev:vite   # raw vite dev, no ZDOC_DIR preset
bun run build      # produce build/ + bin/cli.js
node bin/cli.js -d ./some/docs
```

## License

MIT © o7z
