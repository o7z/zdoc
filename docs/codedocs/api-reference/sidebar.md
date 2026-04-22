---
title: "Sidebar"
description: "Filesystem scanning and sidebar tree construction for zdoc navigation."
---

This module lives at `src/lib/sidebar.ts` and is imported internally as `$lib/sidebar.js`.

## Exported Type

```ts
export interface SidebarGroup {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarGroup[];
}
```

## Exported Function

```ts
export function buildSidebar(docsDir: string): SidebarGroup[]
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `docsDir` | `string` | — | Absolute or relative path to the docs root |

## Return Type

| Return | Type | Description |
|--------|------|-------------|
| value | `SidebarGroup[]` | Nested sidebar tree for the entire docs site |

## Example

```ts
import { buildSidebar } from '$lib/sidebar.js';

const sidebar = buildSidebar('/workspace/docs');
```

Combined with config:

```ts
import { getConfig } from '$lib/config.js';
import { buildSidebar } from '$lib/sidebar.js';

const sidebar = buildSidebar(getConfig().docsDir);
```

## Behavior

- ignores entries whose names start with `.`
- includes child directories only when they have a readable `_meta.yaml` with `title`
- includes page links only when `_meta.yaml.pages[key].title` exists and the file exists on disk
- sorts by `order`, then by `text`
- marks groups as expanded by default with `collapsed: false`

Link generation uses the actual filename path relative to the docs root, so Markdown links look like `/guides/setup.md` rather than suffixless slugs.

This module is used once per layout load, but it is responsible for the shape of nearly every navigation interaction in the UI. Because the scanner reads the real filesystem and sorts everything itself, it effectively defines what “published documentation” means in zdoc.

In practice, `buildSidebar()` pairs with `readDirMeta()` to enforce a strict contract: visible directories need their own `_meta.yaml`, and visible pages need both a real file and a declared metadata entry. That keeps the navigation tree stable even when the docs directory contains extra notes, partial drafts, or hidden support files.

## Related Modules

- [Meta](/docs/api-reference/meta)
- [Routing Runtime](/docs/api-reference/routing-runtime)
