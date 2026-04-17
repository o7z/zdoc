# @o7z/zdoc

**English** · [简体中文](./README.zh-CN.md)

Zero-config Markdown docs server. Point `zdoc` at a folder of `.md` files, get a polished docs site with:

- Automatic sidebar driven by `_meta.yaml` files
- Server-side password protection with in-browser password change
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
  -w, --password <pwd>   Access password (default: none, docs are public; set to enable auth)
  -h, --help             Show help
  -v, --version          Show version
```

Examples:

```bash
zdoc                                # cwd, port 8888, no password (public)
zdoc -d ./docs -p 3000              # custom dir and port
zdoc -w hunter2                     # enable password protection
zdoc -w hunter2 -p 8080 -d ./site   # full override
```

If the chosen port is busy, `zdoc` automatically picks the next available port.

## Configuration (`config.json`)

Create a `config.json` in the directory where you run `zdoc` to set defaults:

```json
{
  "title": "My Docs",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888
}
```

Precedence: **CLI flags > `config.json` > defaults**.

If `config.json` exists, the in-browser **Change Password** dialog also persists to this file.
Without `config.json`, password changes are in-memory only (reset on restart).

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
  config:
    title: Config
    order: 2
  report.pdf:                # PDFs: use the full filename including extension
    title: Q4 Report
    order: 3
```

Directories without `_meta.yaml` are hidden entirely. `.md` files not listed under `pages` are not routable (404) and don't appear in the sidebar.

### Per-page fields

| Field      | Required | Description                                                                 |
|------------|----------|-----------------------------------------------------------------------------|
| `title`    | Yes      | Sidebar label. Omitting it hides the page.                                  |
| `order`    | No       | Sort weight. Default `999`.                                                 |
| `modified` | No       | Informational "last modified" string.                                       |
| `env`      | No       | Set to `prod` to hide in development (`NODE_ENV !== 'production'`).         |

### Directory guide page (`index.md`)

Put an `index.md` in any directory and it becomes the landing page shown when the user clicks the directory title in the sidebar. `index.md` contains pure Markdown — no metadata, no frontmatter (except the optional site-home hero below).

The directory's title comes from `_meta.yaml`, so `index.md` doesn't need to declare one.

### Site home

The top-level docs directory works the same way:

- `<docsDir>/_meta.yaml` declares the site title
- `<docsDir>/index.md` is the site home page

### Example layout

```
docs/
├── _meta.yaml              # title: My Docs
├── index.md                # site home (plain Markdown)
├── getting-started/
│   ├── _meta.yaml          # title: Getting Started; order: 1; pages: {install:…, config:…}
│   ├── index.md            # directory guide page (optional)
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
    link: /getting-started/install
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

- **Mermaid**: Fenced ```` ```mermaid ```` blocks render as SVG.
- **Syntax highlighting**: `rehype-highlight` with automatic language detection.
- **Search**: Press `Ctrl+K` (Mac: `Cmd+K`) to fuzzy-search sidebar titles.
- **Dark mode**: Auto-detect + manual toggle, persisted to `localStorage`.
- **Password protection**: Server-side HttpOnly session cookie. Omit `-w` or pass `-w ""` to disable.
- **PDFs**: listed in `_meta.yaml` pages, opened in the browser's native PDF viewer via iframe.

## Development (for contributors)

```bash
bun install
bun run dev     # vite dev server
bun run build   # produce build/ + bin/cli.js
node bin/cli.js -d ./some/docs
```

## License

MIT © o7z
