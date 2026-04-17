# @o7z/zdoc

[English](./README.md) · [简体中文](./README.zh-CN.md)

Zero-config Markdown docs server. Point `zdoc` at a folder of `.md` files, get a polished docs site with:

- Automatic sidebar from directory structure (`_meta.md` + HTML-comment metadata)
- Server-side password protection with in-browser password change
- Mermaid diagrams
- Dark mode + Ctrl+K search
- Responsive layout

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

## Authoring documents

### File metadata

Put a single `<!-- zdoc: {...} -->` comment at the top of each `.md` file. The inside is **YAML flow** syntax — compact config, strict parsing, but still wrapped in an HTML comment so GitHub/Gitee/any Markdown renderer hides it entirely.

```markdown
<!-- zdoc: {title: Getting started, order: 1, modified: 2026-04-18, env: prod} -->

# Getting started

Page content…
```

Fields:

| Field      | Required | Description                                                                 |
|------------|----------|-----------------------------------------------------------------------------|
| `title`    | Yes      | Sidebar label. Files without a `title` are hidden and return 404.           |
| `order`    | No       | Sort weight (lower = earlier). Default `999`.                               |
| `modified` | No       | Informational "last modified" string.                                       |
| `env`      | No       | Set to `prod` to hide the file in development (`NODE_ENV !== 'production'`).|

Strings with spaces don't need quotes. If your value contains `,` `:` `{` `}`, wrap it: `{title: "Foo, bar"}`.

> **Back-compat:** the older form `<!-- title: Foo -->` / `<!-- order: 1 -->` (one key per comment) still works. `zdoc:` takes precedence when both are present.

### Directory metadata + guide page (`_meta.md`)

Every directory that should appear in the sidebar needs a `_meta.md`. The metadata comment controls the sidebar entry; **anything after the comment is rendered as the directory's guide page** (the landing page shown when you click the directory title in the sidebar).

```markdown
<!-- zdoc: {title: Guides, order: 2} -->

# Guides

Welcome. Start with [Basics](./basics).
```

- If `_meta.md` has a non-empty body → that body is the guide page, and documents in this directory don't need their own `title` just to appear as the landing page (though individual files still need `title` to appear in the sidebar).
- If `_meta.md` has only the metadata line and no body → falls back to `index.md` (if present), preserving older layouts.
- Directories without `_meta.md` are hidden entirely. The folder name on disk never affects the UI.

### Root `_meta.md` = site home

The docs directory itself can have a `_meta.md`. If it does, its body becomes the site's home page (replacing the need for a top-level `index.md`):

```markdown
<!-- zdoc: {title: My Docs} -->

# My Docs

Welcome — pick a topic from the sidebar.
```

If you need the full hero block (name/text/tagline/features/actions), keep using `index.md` with YAML frontmatter — that path still works.

### Example layout

```
docs/
├── _meta.md                # Site home: <!-- zdoc: {title: My Docs} --> + body
├── getting-started/
│   ├── _meta.md            # Directory guide: <!-- zdoc: {title: Getting Started, order: 1} --> + body
│   ├── install.md          # <!-- zdoc: {title: Install, order: 1} -->
│   └── config.md           # <!-- zdoc: {title: Config, order: 2} -->
├── guide/
│   ├── _meta.md            # <!-- zdoc: {title: Guide, order: 2} --> (no body → falls back to index.md)
│   ├── index.md            # Legacy-style landing page
│   └── basics.md           # <!-- zdoc: {title: Basics} -->
├── internal.md             # No zdoc comment → hidden from sidebar
└── api/
    └── reference.md        # No _meta.md in this folder, whole folder hidden
```

### Landing-page hero (optional)

`index.md` supports a YAML frontmatter hero block:

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

### PDFs

Drop any `.pdf` file into your docs directory and it appears in the sidebar automatically — filename (minus extension) becomes the title, and clicking opens the browser's native PDF viewer in an iframe.

To override the title or ordering, create a sibling `<filename>.pdf.meta.md`:

```markdown
<!-- zdoc: {title: Q4 Report, order: 3} -->
```

## Features reference

- **Mermaid**: Fenced ```` ```mermaid ```` blocks render as SVG.
- **Syntax highlighting**: `rehype-highlight` with automatic language detection.
- **Search**: Press `Ctrl+K` (Mac: `Cmd+K`) to fuzzy-search sidebar titles.
- **Dark mode**: Auto-detect + manual toggle, persisted to `localStorage`.
- **Password protection**: Server-side session cookie (HttpOnly). Use an empty password (`-w ""`) to disable.

## Development (for contributors)

```bash
bun install
bun run dev    # vite dev server
bun run build  # produce build/ + bin/cli.js
node bin/cli.js -d ./some/docs
```

## License

MIT © o7z
