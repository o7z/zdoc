---
title: "Serve Existing Docs"
description: "Turn an existing Markdown folder into a structured zdoc site with minimal changes."
---

This guide covers the common migration path: you already have Markdown in a repository, but you need navigation, a landing page, and stable routes.

## Problem

You have a folder full of `.md` files, maybe grouped by topic, but there is no sidebar, no consistent ordering, and no obvious homepage.

## Solution

Add `_meta.yaml` files to each visible directory, create a root `index.md`, and start `zdoc` against that folder.

<Steps>
<Step>
### Create the root metadata file

```yaml title="docs/_meta.yaml"
title: Product Docs
order: 0

pages:
  getting-started:
    title: Getting Started
    order: 1
```

</Step>
<Step>
### Add a landing page and a section

```text
docs/
├── _meta.yaml
├── index.md
└── guides/
    ├── _meta.yaml
    ├── setup.md
    └── deployment.md
```

```yaml title="docs/guides/_meta.yaml"
title: Guides
order: 1

pages:
  setup:
    title: Setup
    order: 1
  deployment:
    title: Deployment
    order: 2
```

</Step>
<Step>
### Start zdoc

```bash
npx @o7z/zdoc -d ./docs -t "Product Docs"
```

</Step>
<Step>
### Link pages using actual routed filenames

```md title="docs/index.md"
# Product Docs

- [Setup](/guides/setup.md)
- [Deployment](/guides/deployment.md)
```

</Step>
</Steps>

Complete runnable example:

```text
repo/
├── docs/
│   ├── _meta.yaml
│   ├── index.md
│   └── guides/
│       ├── _meta.yaml
│       ├── setup.md
│       └── deployment.md
└── package.json
```

```bash
cd repo
npx @o7z/zdoc -d ./docs -p 3000
```

The important source-level detail is that `src/lib/sidebar.ts` generates links from the real filename, and `src/routes/[...path]/+page.server.ts` only serves paths ending in `.md` or `.pdf`. If you have old internal links without suffixes, update them during the migration.

After the server starts:

- `/` renders `docs/index.md`
- `/guides/setup.md` renders `docs/guides/setup.md`
- `/guides/deployment.md` renders `docs/guides/deployment.md`

This is the simplest stable structure because the home page stays human-authored and every subpage is explicitly declared in metadata. If you need richer metadata chips, add `description`, `version`, `author`, or `modified` on the relevant `pages.<key>` entries in `_meta.yaml`.

One practical migration pattern is to start by declaring only the pages you actively want in navigation. Because `src/routes/[...path]/+page.server.ts` also checks `_meta.yaml` before rendering, undeclared Markdown files effectively become drafts without needing a separate drafts folder. That makes zdoc a good fit for repositories where documentation quality varies by section and teams want a simple publication boundary inside the same tree.
