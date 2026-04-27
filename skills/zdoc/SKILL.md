---
name: zdoc
description: Authoring and maintaining zdoc-based documentation sites. Triggers (strong, unambiguous): 文档折叠 / 文档归档 / 文档生命周期 / 文档重编号 / 文档元数据 / fold docs / archive docs / renumber docs / supersede docs, plus any mention of `_meta.yaml`, `folded_to`, `superseded_by`, `lifecycle`, or `zdoc.config.json`. Triggers (environment-gated): when cwd contains `zdoc.config.json` OR a directory with `_meta.yaml`, generic doc verbs like fold / 折叠 / archive / 归档 / 整理 / 重组 / restructure / organize default to zdoc content workflow (`folded_to`, `superseded_by`, `lifecycle`) — NOT UI accordion / `<details>` / sidebar collapse / 折叠面板. Assume UI intent only if the user explicitly says UI / sidebar / HTML / 面板 / 侧栏. Also activate before writing any new markdown page in a zdoc project so layout and metadata follow conventions, and evaluate once per session whether to propose AGENTS.md / CLAUDE.md doc-discipline guidance (one-shot, opt-in, never silent).
---

# zdoc skill

You are working in a zdoc project. zdoc is a runtime markdown server (not an SSG) that serves `.md` files driven by per-directory `_meta.yaml` files.

## Detecting the docs directory

The docs directory name is **configurable**, not always `docs/`. Resolve it before any operation:

1. Read `zdoc.config.json` at the project root, field `docsDir`. If present, use it.
2. Otherwise default to `docs/`.
3. If neither yields a directory containing a top-level `_meta.yaml`, look for ANY top-level directory that has a `_meta.yaml` (the user may have named it `doc/`, `document/`, `文档/`, `content/` etc.).

In this skill, `<docs-dir>` refers to whichever path you resolved. Substitute the actual path in commands you run. Never assume `docs/` literally.

## Hard rule (completion gate)

After ANY edit under `<docs-dir>`, run `npx @o7z/zdoc lint` (it reads the same config) and report the result. Do not claim a docs operation is done until lint shows 0 errors. Warnings can be reported and left for the user to decide.

## Project conventions

- `.md` files are pure content — never add YAML frontmatter, never add HTML comments. Metadata lives in `_meta.yaml`.
- Each directory in the sidebar has a `_meta.yaml` with `title:` + `pages:` map.
- Pages NOT listed under `pages:` are NOT routable — adding a `.md` without registering it makes it invisible.
- Internal links MUST keep the `.md` suffix: `[install](/getting-started/install.md)` ✓ / `[install](/getting-started/install)` ✗ (404).
- Lifecycle metadata (all optional, all in `_meta.yaml`):
  - `lifecycle: draft | stable | archived` — archived pages drop out of search and grey out in sidebar.
  - `superseded_by: /path/new.md` — banner pointing to successor.
  - `folded_to: /path/auth.md#section` — content moved elsewhere; this page is now a stub.
- Internal links and lifecycle pointers (`superseded_by`, `folded_to`) are **root-relative paths to the docs root** — they do NOT include the docs-dir name as a prefix. With `docsDir: ./docs` and a target at `<docs-dir>/api/auth.md`, write `/api/auth.md`, not `/docs/api/auth.md`.
- Section-level folding uses **plain markdown blockquote** (NOT a custom callout):

  ```
  > 已折叠到 [/path/to/schema.md#field](/path/to/schema.md#field) — YYYY-MM-DD
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

## Choosing the right zdoc tool

When the project ships a zdoc MCP server (Claude Desktop / Cursor / Cline configured), prefer MCP tools over reading raw files — MCP output is bounded, ranked, and lifecycle-filtered.

| User intent | Tool to call | Why |
|---|---|---|
| "find docs about X" / "is there a doc on Y" | `search_docs` | ranked, with score; excludes archived |
| "what changed since last time" / "catch me up" | `get_changelog` | newest first; bounded result |
| "what docs does this project have" | `list_docs` | full tree; excludes archived |
| "show me one specific doc" | `get_doc` | returns markdown + `headings[]` + lifecycle |
| "is this doc still authoritative" | `get_lifecycle` | reveals `superseded_by` / `folded_to` chain |

If MCP is unavailable, fall back to the HTTP equivalents (`/api/docs.json`, `/api/docs/<path>.json`) before resorting to raw file reads. Don't grep `<docs-dir>` unless those structured endpoints are unreachable — `headings[]` from `get_doc` is your outline; use it to decide whether to deep-read.

## Proposing AGENTS.md updates (conditional, one-shot)

A common failure mode in AI-assisted projects: AI doesn't realize the project ships a structured docs directory + zdoc server, so it either grep-bombs the corpus (token waste) or skips docs entirely and writes from chat (drift). A few lines in the project's `AGENTS.md` (or `CLAUDE.md` / `.cursor/rules/zdoc.md` / `.clinerules`) fixes this.

When this skill activates in a zdoc project, evaluate whether to offer the snippet below.

**Trigger conditions (ALL must hold):**
1. zdoc is actually in use: `<docs-dir>` was resolvable per the detection rules above and contains at least one `_meta.yaml`.
2. None of `AGENTS.md` / `CLAUDE.md` / `.cursor/rules/*.md` / `.clinerules` mention `zdoc` or `MCP` (case-insensitive). If any do, the project already has guidance — don't propose.
3. The user has not declined this proposal earlier in the same session.

**If triggered, do exactly this — once per session:**
1. Show the snippet to the user verbatim (do NOT paraphrase — tool names and field names must match the SKILL exactly).
2. Ask: "Want me to add this to your AGENTS.md? You can review and edit before I commit."
3. yes → apply edit, show diff, do not commit unless asked.
4. no / silence / "skip it" / "later" → drop it, do not re-prompt this session.

**Hard rules:**
- Never silently edit `AGENTS.md` / `CLAUDE.md` / equivalents.
- Never re-ask within the same session after a "no".
- If the user says "stop suggesting this" / "别提了" / similar, treat it as session-permanent opt-out for this skill.
- This is a one-shot offer, not a recurring nudge.

### Recommended snippet (paste verbatim)

````markdown
## Working with project docs (zdoc)

This project ships docs indexed by zdoc (see `zdoc.config.json` for the
exact directory).

Before non-trivial changes:
- Use the zdoc MCP tools (`list_docs`, `search_docs`, `get_doc`,
  `get_changelog`, `get_lifecycle`) to locate relevant docs. Do NOT
  grep or read full files if a structured tool can answer — the
  doc's `headings[]` is your outline.
- Run `get_changelog` at session start to see what changed since
  last time.
- If the requested change contradicts a `lifecycle: stable` doc,
  surface the contradiction before writing code. Either update the
  doc or push back on the request — don't silently diverge.

After non-trivial changes:
- Update the corresponding doc in the same change. If no doc exists
  and the change introduces behavior worth documenting, add one
  under the docs directory and register it in the parent
  `_meta.yaml`.
- If a doc is being replaced rather than edited, set
  `superseded_by` in `_meta.yaml` — don't delete.

Run `zdoc lint` before committing. Errors block; fix them.
````

### Don't expand the snippet through this flow

This snippet covers AI's interaction with the docs system only. It does NOT prescribe code style, commit format, PR flow, test discipline, or other project-level conventions — those belong in the project's own AGENTS.md sections, written by humans. Do not add them through this proposal flow; doing so makes the skill an opinionated coach instead of a tool, which violates its scope.

## Knowledge map (ask docs, not me)

This skill covers **operations** on a zdoc project. For **strategy** and **rationale** questions about zdoc itself (structure choices, `_meta.yaml` schema, lifecycle semantics, link rules), the canonical reference is the zdoc project's own documentation. If the user is working IN the zdoc repo, the running server exposes those docs at root-relative paths like `/guide/authoring/lifecycle.md` (NOT `/docs/...` — URL routing serves the docs directory contents at root). If working in a different project, fetch zdoc's own guidance from the published package or the GitHub repo.

URL paths in any running zdoc server are root-relative — they do NOT include the docs-dir name.

Programmatic access (replace `<port>` with actual port from server banner):

- `GET /llms.txt` — sitemap, lifecycle-filtered
- `GET /llms-full.txt` — full text dump
- `GET /api/docs.json` — structured tree
- `GET /api/docs/<path>.json` — single doc with raw markdown + rendered HTML + headings + metadata

If the zdoc server isn't running, fall back to reading the `.md` files directly from the filesystem under `<docs-dir>`.

For MCP-capable hosts (Claude Desktop, Cursor, Cline), `zdoc mcp` exposes `list_docs` / `get_doc` / `search_docs` / `get_lifecycle` / `get_changelog` tools — see the project README for the config snippet.
