---
title: "Config"
description: "The exported configuration singleton used across the zdoc runtime."
---

This module is internal to the SvelteKit runtime, not a public package export. It lives at `src/lib/config.ts` and is imported internally as `$lib/config.js`.

## Exported Types

```ts
export interface DocsConfig {
  title: string;
  docsDir: string;
  password: string;
  port: number;
}
```

## Exported Function

```ts
export function getConfig(): DocsConfig
```

## Parameters

`getConfig()` takes no parameters.

## Return Type

| Return | Type | Description |
|--------|------|-------------|
| value | `DocsConfig` | Process-wide configuration snapshot loaded at module initialization |

## Resolution Rules

`loadConfig()` inside the module resolves:

| Field | Environment variable | Config file key | Default |
|-------|----------------------|-----------------|---------|
| `title` | `ZDOC_TITLE` | `title` | `"Docs"` |
| `docsDir` | `ZDOC_DIR` | `docsDir` | `process.cwd()` |
| `password` | `ZDOC_PASSWORD` | `password` | `""` |
| `port` | `PORT` | `port` | `8888` |

The resolved `docsDir` is normalized with `resolve(docsDirRaw)`.

This module exists to give the rest of the runtime a single, stable configuration object. `src/hooks.server.ts`, `src/routes/+layout.server.ts`, and the page loaders all rely on that invariant instead of reading environment variables directly.

## Example

```ts
import { getConfig } from '$lib/config.js';

const config = getConfig();
console.log(config.docsDir);
```

Common composition with other modules:

```ts
import { getConfig } from '$lib/config.js';
import { buildSidebar } from '$lib/sidebar.js';

const config = getConfig();
const sidebar = buildSidebar(config.docsDir);
```

A second common pattern is auth gating:

```ts
import { getConfig } from '$lib/config.js';

if (!getConfig().password) {
  // public site
}
```

## Notes

- `state` is computed once and cached.
- `zdoc.config.json` parse failures are swallowed and treated as an empty config.
- The module does not watch the filesystem for changes.
- `docsDir` is always resolved to an absolute path before other modules consume it.

## Related Modules

- [Docs Dir](/docs/api-reference/docs-dir)
- [Sidebar](/docs/api-reference/sidebar)
- [Routing Runtime](/docs/api-reference/routing-runtime)
