---
title: "Types"
description: "Exported TypeScript interfaces and structural types defined in the zdoc source tree."
---

zdoc is primarily a CLI, but the runtime code still exposes a small set of useful TypeScript types. These are internal source types rather than supported package imports.

## `DocsConfig`

Source: `src/lib/config.ts`

```ts
export interface DocsConfig {
  title: string;
  docsDir: string;
  password: string;
  port: number;
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `title` | `string` | Site title shown in the layout header and browser title |
| `docsDir` | `string` | Absolute path to the served docs root |
| `password` | `string` | Whole-site password; empty string disables auth |
| `port` | `number` | Bound server port |

## `PageMeta`

Source: `src/lib/meta.ts`

```ts
export interface PageMeta {
  title?: string;
  order?: number;
  modified?: string;
  env?: string;
  description?: string;
  version?: string;
  author?: string;
}
```

This structure is used for both directory-level and page-level metadata, although only some fields are meaningful at the directory level in practice.

## `DirMeta`

Source: `src/lib/meta.ts`

```ts
export interface DirMeta extends PageMeta {
  pages?: Record<string, PageMeta>;
}
```

`pages` maps either:

- Markdown filenames without `.md`
- PDF filenames including `.pdf`

to their `PageMeta`.

## `SidebarGroup`

Source: `src/lib/sidebar.ts`

```ts
export interface SidebarGroup {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarGroup[];
}
```

This drives the recursive navigation renderer in `src/routes/+layout.svelte`.

## `Heading`

Source: `src/lib/markdown.ts`

```ts
export interface Heading {
  depth: 1 | 2 | 3;
  text: string;
  slug: string;
}
```

The renderer only tracks `h1`, `h2`, and `h3`, because deeper headings are ignored by the TOC logic.

## `RenderResult`

Source: `src/lib/markdown.ts`

```ts
export interface RenderResult {
  html: string;
  headings: Heading[];
}
```

This is the contract between the Markdown renderer and the route loaders.

## Practical Usage

If you are extending zdoc internally, the most common combinations are:

```ts
import type { DocsConfig } from '$lib/config.js';
import type { DirMeta } from '$lib/meta.js';
import type { RenderResult } from '$lib/markdown.js';
import type { SidebarGroup } from '$lib/sidebar.js';
```

That lets you thread config, parsed metadata, rendered HTML, and navigation together without re-deriving the shapes from runtime values.

<Callout type="info">Because the package does not publish subpath exports for these modules, treat these types as source-level contracts for contributors rather than a stable public SDK.</Callout>
