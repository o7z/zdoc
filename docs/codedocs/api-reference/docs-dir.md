---
title: "Docs Dir"
description: "Small path helper for retrieving the resolved docs directory."
---

This module lives at `src/lib/docs-dir.ts` and is imported internally as `$lib/docs-dir.js`.

## Exported Function

```ts
export function getDocsDir(): string
```

## Parameters

`getDocsDir()` takes no parameters.

## Return Type

| Return | Type | Description |
|--------|------|-------------|
| value | `string` | Absolute docs directory path from `getConfig().docsDir` |

## Example

```ts
import { getDocsDir } from '$lib/docs-dir.js';

const docsDir = getDocsDir();
```

Combined with filesystem access:

```ts
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { getDocsDir } from '$lib/docs-dir.js';

const raw = readFileSync(join(getDocsDir(), 'index.md'), 'utf-8');
```

Used from a route loader:

```ts
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getDocsDir } from '$lib/docs-dir.js';

const indexPath = join(getDocsDir(), 'index.md');
if (!existsSync(indexPath)) {
  // return a placeholder page
}
```

## Source Notes

The function is intentionally trivial:

```ts
export function getDocsDir(): string {
  return getConfig().docsDir;
}
```

That small wrapper keeps route modules from reaching into the broader config object when all they need is the content root.

It also gives the codebase a clear seam if docs root resolution ever becomes more complex. Right now it is just a single line, but it localizes that assumption in one place instead of scattering `getConfig().docsDir` across every file-reading module.

Because route loaders use the helper directly, any future change to path normalization, multi-root support, or tenant-aware docs directories would likely start here.

That small abstraction also makes testing easier for contributors working inside the source tree. Instead of reasoning about whether a loader remembered to normalize the docs path itself, they can follow a single helper and see that every consumer shares the same resolved base directory.

## Related Modules

- [Config](/docs/api-reference/config)
- [Routing Runtime](/docs/api-reference/routing-runtime)
