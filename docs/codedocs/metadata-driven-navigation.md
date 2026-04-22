---
title: "Metadata-Driven Navigation"
description: "How _meta.yaml controls visibility, ordering, labels, and per-page metadata throughout zdoc."
---

The most important content concept in zdoc is that the filesystem alone does not define the site. `_meta.yaml` does.

## What It Is

Each directory that should appear in the sidebar needs a `_meta.yaml`. The file gives the directory a title and order, and the nested `pages` object declares which files are visible and how they are labeled.

```yaml
title: Guides
order: 2

pages:
  install:
    title: Install
    order: 1
    description: Setup instructions
  reference.pdf:
    title: Reference PDF
    order: 2
```

## Why It Exists

This model solves two problems at once:

- It decouples storage from navigation, so a folder can contain drafts, notes, or generated files that never appear in the UI.
- It lets zdoc keep authoring plain Markdown. Page metadata lives in one directory-level file instead of repeating frontmatter across many pages.

## How It Works Internally

The parser in `src/lib/meta.ts` is a custom object-oriented YAML reader. `parseYaml(input)` tokenizes lines by indentation, strips comments with `stripComment()`, parses only scalar values with `parseScalar()`, and recursively builds nested objects with `parseBlock()`.

`readDirMeta(metaYamlPath)` then coerces that generic object into:

- directory-level fields: `title`, `order`, `env`
- page-level fields inside `pages`: `title`, `order`, `modified`, `env`, `description`, `version`, `author`

`src/lib/sidebar.ts` consumes that structure in two passes:

1. Walk child directories and keep only those with a visible `_meta.yaml` and `title`.
2. Walk `pages` entries and keep only files that both exist on disk and have a visible `title`.

```mermaid
flowchart TD
  A[_meta.yaml] --> B[parseYaml]
  B --> C[readDirMeta]
  C --> D[SidebarGroup[]]
  C --> E[Page metadata chips]
  D --> F[Sidebar navigation]
  E --> G[Description, version, author, modified]
```

A page is routable only if the parent `_meta.yaml` includes it. That logic lives in `src/routes/[...path]/+page.server.ts`, which resolves the file, derives the page key from the filename, and then checks `parentMeta?.pages?.[key]`.

## How It Relates To Other Concepts

- The CLI chooses which docs directory to scan, but `_meta.yaml` decides what inside that directory is public.
- The Markdown pipeline uses `_meta.yaml` metadata for the page info bar; it does not read per-page frontmatter except for the root home hero.
- Auth protects the entire site uniformly, regardless of metadata visibility.

## Basic Example

Hide an unfinished page simply by omitting it:

```yaml
title: Tutorials
pages:
  basics:
    title: Basics
```

If `advanced.md` exists in the same folder but is not listed, the sidebar ignores it and the route loader returns `404`.

## Advanced Example

Use `env: prod` to keep release-only pages out of development:

```yaml
title: Release Notes

pages:
  preview:
    title: Preview Notes
  customer-announcement:
    title: Customer Announcement
    env: prod
    version: 1.0.12
    modified: 2026-04-22
```

Because both `src/lib/sidebar.ts` and `src/routes/[...path]/+page.server.ts` call a `visible()` helper, the page is hidden in the sidebar and blocked by the router when `NODE_ENV !== "production"`.

<Callout type="warn">The YAML parser in `src/lib/meta.ts` does not implement full YAML. Arrays are not supported, malformed indentation returns `null` from `readDirMeta()`, and values outside the known scalar patterns stay as strings. Keep `_meta.yaml` simple and object-based.</Callout>

<Accordions>
<Accordion title="Why zdoc keeps metadata outside individual Markdown files">
This design keeps Markdown content portable. Authors can move `.md` files between tools without stripping frontmatter fields that only one renderer understands. It also centralizes navigation changes, which is useful when a directory owner wants to rename or reorder several pages at once. The trade-off is indirection: to understand why a page is hidden or what title it will use, you must inspect `_meta.yaml` rather than the document itself.
</Accordion>
<Accordion title="Why the project uses a custom YAML parser instead of a dependency">
The custom parser keeps the dependency graph small and the accepted schema narrow. That matches zdoc’s overall zero-config posture and avoids adding another parse library for a tiny subset of YAML features. The downside is that the parser is intentionally incomplete, and the limitations are part of the product surface whether or not they are documented elsewhere. If you need arrays, anchors, or richer types, you would have to swap in a real YAML parser and tighten validation around the resulting object shape.
</Accordion>
</Accordions>
