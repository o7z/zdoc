---
title: "Routing Runtime"
description: "Server hooks and route loader entry points that turn the docs directory into pages and PDF responses."
---

These exports are runtime entry points for SvelteKit rather than stable package APIs. They are still the most important server-side functions in the codebase.

## Source Modules

- `src/hooks.server.ts`
- `src/routes/+layout.server.ts`
- `src/routes/+page.server.ts`
- `src/routes/[...path]/+page.server.ts`
- `src/routes/api/pdf/[...path]/+server.ts`

## Exported Signatures

```ts
export const handle: Handle = async ({ event, resolve }) => { ... }
```

```ts
export const load: LayoutServerLoad = () => { ... }
```

```ts
export const load: PageServerLoad = async () => { ... }
```

```ts
export const load: PageServerLoad = async ({ params }) => { ... }
```

```ts
export const GET: RequestHandler = ({ params }) => { ... }
```

## Entry Point Responsibilities

| Export | Source file | Responsibility |
|--------|-------------|----------------|
| `handle` | `src/hooks.server.ts` | Password gate, login POST handling, and redirect enforcement |
| `load` | `src/routes/+layout.server.ts` | Loads `sidebar` and `siteTitle` for the app shell |
| `load` | `src/routes/+page.server.ts` | Loads the docs root `index.md`, optional hero data, and rendered HTML |
| `load` | `src/routes/[...path]/+page.server.ts` | Serves declared Markdown and PDF document routes |
| `GET` | `src/routes/api/pdf/[...path]/+server.ts` | Streams PDF bytes with safe path checks |

## Example Request Flows

Home page:

```text
GET /
  -> +page.server.ts
  -> read <docsDir>/index.md
  -> parse optional hero block
  -> render markdown body
```

Markdown page:

```text
GET /guides/setup.md
  -> hooks.server.ts
  -> [...path]/+page.server.ts
  -> read parent _meta.yaml
  -> renderMarkdown(raw)
```

PDF page:

```text
GET /reports/q2-report.pdf
  -> hooks.server.ts
  -> [...path]/+page.server.ts
  -> return iframe URL /api/pdf/reports/q2-report.pdf
  -> api/pdf/[...path]/+server.ts streams bytes
```

## Common Composition Pattern

The runtime path is layered:

1. `handle` authorizes or redirects.
2. `+layout.server.ts` prepares navigation for every page.
3. A route-specific loader reads files from the docs directory.
4. The corresponding Svelte component renders HTML, Mermaid, the TOC, or the PDF iframe.

## Notes

- Markdown and PDF routes are suffix-based.
- `safeJoin()` in the document loader and `resolve(root, slug)` checks in the PDF handler guard against path traversal.
- The root home route is not generated from `_meta.yaml.pages`; it is hardcoded to `index.md`.

## Related Modules

- [Config](/docs/api-reference/config)
- [Meta](/docs/api-reference/meta)
- [Markdown](/docs/api-reference/markdown)
- [Sidebar](/docs/api-reference/sidebar)
- [Sessions](/docs/api-reference/sessions)
