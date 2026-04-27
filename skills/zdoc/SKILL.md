---
name: zdoc
description: Authoring and maintaining zdoc-based documentation sites. Activate when working with `_meta.yaml`, `lifecycle` / `superseded_by` / `folded_to` metadata, folding research content into authoritative docs, renumbering directories, fixing cross-doc links, or when the user asks how to organize / structure their docs. Also activate before writing any new markdown page in a zdoc project so layout and metadata follow conventions.
---

# zdoc skill

You are working in a zdoc project. zdoc is a runtime markdown server (not an SSG) that serves `.md` files driven by per-directory `_meta.yaml` files.

## Hard rule (completion gate)

After ANY edit under `docs/`, run `npx @o7z/zdoc lint -d ./docs` and report the result. Do not claim a docs operation is done until lint shows 0 errors. Warnings can be reported and left for the user to decide.

## Project conventions

- `.md` files are pure content — never add YAML frontmatter, never add HTML comments. Metadata lives in `_meta.yaml`.
- Each directory in the sidebar has a `_meta.yaml` with `title:` + `pages:` map.
- Pages NOT listed under `pages:` are NOT routable — adding a `.md` without registering it makes it invisible.
- Internal links MUST keep the `.md` suffix: `[install](/getting-started/install.md)` ✓ / `[install](/getting-started/install)` ✗ (404).
- Lifecycle metadata (all optional, all in `_meta.yaml`):
  - `lifecycle: draft | stable | archived` — archived pages drop out of search and grey out in sidebar.
  - `superseded_by: /path/new.md` — banner pointing to successor.
  - `folded_to: /path/auth.md#section` — content moved elsewhere; this page is now a stub.
- Section-level folding uses **plain markdown blockquote** (NOT a custom callout):

  ```
  > 已折叠到 [/docs/.../schema.md#field](/docs/.../schema.md#field) — YYYY-MM-DD
  ```

## Standard procedure: fold a section

When the user asks to "fold X to Y" / "把研究文档某段折叠到权威文档":

1. Read the source section.
2. Append its content to the target doc at the requested anchor (create the anchor heading if missing).
3. Replace the source section body with the standard blockquote pointer above.
4. If the entire source page becomes a stub, add `folded_to: <target-path-with-anchor>` to the source's `_meta.yaml` entry.
5. Run lint; report.

## Standard procedure: renumber directories

When the user asks to "重编号" / "rename `01-foo/` to `a-foo/`":

1. List all dirs / files to be renamed; print mapping table.
2. CONFIRM with the user before writing — large mechanical refactors must be confirmed.
3. `git mv` to preserve history.
4. grep all `.md` for old paths; rewrite cross-doc links per the mapping.
5. Run lint; resolve broken links surfaced.
6. Report counts: dirs renamed, links updated, lint status.

## Knowledge map (ask docs, not me)

This skill covers **operations** on a zdoc project. For **strategy** and **rationale** questions, defer to the project's own docs (assume the zdoc server is running — the banner shows the actual port):

| User asks about | Where to look |
|---|---|
| How to organize / structure docs | `/docs/guide/authoring/choose-a-structure/` (3 patterns: builder / Diátaxis / flat) |
| `_meta.yaml` schema details | `/docs/guide/authoring/meta-yaml.md` |
| Per-page metadata fields | `/docs/guide/authoring/page-fields.md` |
| Lifecycle / folding semantics | `/docs/guide/authoring/lifecycle.md` |
| Internal link rules | `/docs/guide/authoring/links-and-routes.md` |

Programmatic access (replace `<port>` with actual port from server banner):

- `GET /llms.txt` — sitemap, lifecycle-filtered
- `GET /llms-full.txt` — full text dump
- `GET /api/docs.json` — structured tree
- `GET /api/docs/<path>.json` — single doc with raw markdown + rendered HTML + headings + metadata

If the zdoc server isn't running, fall back to reading the `.md` files directly from the filesystem (`docs/guide/authoring/...`).

For MCP-capable hosts (Claude Desktop, Cursor, Cline), `zdoc mcp` exposes `list_docs` / `get_doc` / `search_docs` / `get_lifecycle` tools — see the project README for the config snippet.
