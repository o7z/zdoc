---
title: "Meta"
description: "The _meta.yaml parser and metadata coercion layer used for navigation and page metadata."
---

This module lives at `src/lib/meta.ts` and is imported internally as `$lib/meta.js`.

## Exported Types

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

```ts
export interface DirMeta extends PageMeta {
  pages?: Record<string, PageMeta>;
}
```

## Exported Functions

```ts
export function parseYaml(input: string): Record<string, unknown>
```

```ts
export function readDirMeta(metaYamlPath: string): DirMeta | null
```

## Parameters

### `parseYaml`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Raw `_meta.yaml` text |

### `readDirMeta`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `metaYamlPath` | `string` | — | Filesystem path to a `_meta.yaml` file |

## Return Types

| Function | Return type | Description |
|----------|-------------|-------------|
| `parseYaml` | `Record<string, unknown>` | Parsed nested object map |
| `readDirMeta` | `DirMeta \| null` | Coerced directory metadata or `null` when the file is missing or invalid |

## Example

```ts
import { readDirMeta } from '$lib/meta.js';

const meta = readDirMeta('/docs/guides/_meta.yaml');
console.log(meta?.pages?.setup?.title);
```

Direct parser usage:

```ts
import { parseYaml } from '$lib/meta.js';

const parsed = parseYaml(`
title: Guides
pages:
  intro:
    title: Intro
`);
```

## Implementation Notes

- `stripComment()` removes `#` comments unless they appear inside quoted strings.
- `parseScalar()` supports quoted strings, booleans, `null`, integers, and floats.
- `parseBlock()` only handles indentation-based object nesting.
- `readDirMeta()` silently returns `null` on parse failure instead of throwing.
- `coercePageMeta()` normalizes numeric `order` values whether they were written as numbers or numeric strings.

## Common Composition Pattern

```ts
import { join } from 'node:path';
import { readDirMeta } from '$lib/meta.js';
import { getDocsDir } from '$lib/docs-dir.js';

const rootMeta = readDirMeta(join(getDocsDir(), '_meta.yaml'));
```

That pattern is used throughout the app because `readDirMeta()` is the boundary between loose author input and strongly shaped runtime metadata. Once a caller has a `DirMeta`, the rest of the app can reason about visibility, ordering, and page chips without re-validating raw YAML.

## Related Modules

- [Sidebar](/docs/api-reference/sidebar)
- [Routing Runtime](/docs/api-reference/routing-runtime)
- [Types](/docs/types)
