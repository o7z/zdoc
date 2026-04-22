---
title: "Getting Started"
description: "Use zdoc to turn a folder of Markdown and PDF files into a browsable docs site with navigation, search, Mermaid, and optional password protection."
---

`zdoc` is a zero-config Node.js CLI that serves a directory of Markdown files as a full documentation site.

## The Problem

- Raw Markdown folders are easy to keep in Git, but hard to browse once they grow beyond a handful of files.
- Many internal doc sites need just enough structure, search, and auth, without introducing a full CMS or build pipeline.
- Teams often want PDFs, diagrams, and metadata in the same tree instead of maintaining separate systems.
- Most static-site tools ask you to learn a theme system, route conventions, or frontmatter model before you can publish anything.

## The Solution

`zdoc` keeps the content model simple. The CLI points at a docs directory, `src/lib/sidebar.ts` builds navigation from `_meta.yaml`, `src/lib/markdown.ts` renders Markdown plus Mermaid, and `src/hooks.server.ts` optionally gates the whole site behind a password.

```bash
npx @o7z/zdoc -d ./docs -t "Team Handbook" -w hunter2
```

```yaml
title: Handbook
pages:
  index:
    title: Home
  onboarding:
    title: Onboarding
```

## Installation

<Tabs items={["npm", "pnpm", "yarn", "bun"]}>
<Tab value="npm">

```bash
npm install @o7z/zdoc
```

</Tab>
<Tab value="pnpm">

```bash
pnpm add @o7z/zdoc
```

</Tab>
<Tab value="yarn">

```bash
yarn add @o7z/zdoc
```

</Tab>
<Tab value="bun">

```bash
bun add @o7z/zdoc
```

</Tab>
</Tabs>

`package.json` declares `node >= 18`, and the package exposes a single executable entry point: `zdoc`.

## Quick Start

Create a docs tree:

```text
docs/
├── _meta.yaml
├── index.md
└── intro.md
```

```yaml title="_meta.yaml"
title: Team Docs
pages:
  intro:
    title: Introduction
```

```md title="index.md"
# Welcome

This site is served by zdoc.
```

```md title="intro.md"
# Introduction

Hello from the first page.
```

Run the server:

```bash
npx @o7z/zdoc -d ./docs -p 8888 -t "Team Docs"
```

Expected terminal output:

```text
zdoc v1.0.12
➜  Docs:     /absolute/path/to/docs
➜  Local:    http://localhost:8888
➜  Password: disabled
```

Open `/` for the landing page and `/intro.md` for the routed document page. The current source code routes document URLs with the filename suffix intact, because `src/routes/[...path]/+page.server.ts` only resolves paths ending in `.md` or `.pdf`.

## Key Features

- CLI-first startup with config precedence: CLI flags, then `zdoc.config.json`, then defaults
- `_meta.yaml`-driven sidebar and page metadata
- Markdown rendering with syntax highlighting, heading extraction, and copy buttons
- Mermaid diagrams rendered client-side after page load
- Optional password protection backed by in-memory sessions with a 7-day TTL
- Built-in PDF streaming route for files declared in `_meta.yaml`

<Cards>
  <Card title="Architecture" href="/docs/architecture">See how the CLI, loaders, sidebar builder, and renderer fit together.</Card>
  <Card title="Core Concepts" href="/docs/cli-bootstrap">Learn the core mechanics behind config, metadata, rendering, and routing.</Card>
  <Card title="API Reference" href="/docs/api-reference/cli">Inspect the CLI contract and the exported runtime modules.</Card>
</Cards>
