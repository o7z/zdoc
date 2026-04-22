---
title: "Markdown"
description: "The Markdown rendering pipeline that produces HTML and heading metadata."
---

This module lives at `src/lib/markdown.ts` and is imported internally as `$lib/markdown.js`.

## Exported Types

```ts
export interface Heading {
  depth: 1 | 2 | 3;
  text: string;
  slug: string;
}
```

```ts
export interface RenderResult {
  html: string;
  headings: Heading[];
}
```

## Exported Function

```ts
export async function renderMarkdown(md: string): Promise<RenderResult>
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `md` | `string` | — | Raw Markdown input, optionally including a top-level frontmatter block |

## Return Type

| Return | Type | Description |
|--------|------|-------------|
| value | `Promise<RenderResult>` | HTML string and `h1` to `h3` heading metadata |

## Example

```ts
import { renderMarkdown } from '$lib/markdown.js';

const result = await renderMarkdown('# Hello

```ts
console.log(1)
```');
console.log(result.html);
console.log(result.headings);
```

Mermaid example:

```ts
const result = await renderMarkdown(`
# Diagram

\`\`\`mermaid
graph TD
  A --> B
\`\`\`
`);
```

The returned HTML contains a `pre.mermaid` placeholder, which the page component later upgrades to SVG.

Another common usage is in a page loader:

```ts
import { readFileSync } from 'node:fs';
import { renderMarkdown } from '$lib/markdown.js';

const raw = readFileSync('/docs/guide.md', 'utf-8');
const { html, headings } = await renderMarkdown(raw);
```

## Implementation Notes

- strips the first frontmatter block before rendering
- collects headings after `rehype-slug` has assigned IDs
- highlights code with `rehype-highlight`
- wraps code blocks in a `<div class="code-block">` and injects a copy button
- preserves dangerous HTML settings through the Remark/Rehype pipeline

The output is intentionally presentation-ready rather than AST-oriented. If you need structured Markdown transforms after rendering, `renderMarkdown()` is not the right level of abstraction because it returns serialized HTML instead of the intermediate tree.

In other words, this module is optimized for page delivery, not for plugin extensibility. That matches zdoc’s scope: the renderer is a concrete implementation detail of the docs server, and its return value is shaped for immediate use by the Svelte route components.

## Related Modules

- [Routing Runtime](/docs/api-reference/routing-runtime)
- [Types](/docs/types)
