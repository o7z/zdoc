---
title: "Protect Private Docs"
description: "Enable whole-site password protection and understand the operational limits of zdoc’s in-memory session model."
---

This guide is for internal handbooks, runbooks, or customer docs that should not be publicly browsable.

## Problem

You want a private docs site, but you do not want to wire in OAuth, a reverse proxy auth layer, or a database-backed session store.

## Solution

Use zdoc’s built-in password gate. A non-empty password enables the hook in `src/hooks.server.ts`, which protects every route behind a login form and issues a 7-day `docs_session` cookie after successful login.

<Steps>
<Step>
### Add a config file

```json title="zdoc.config.json"
{
  "title": "Internal Runbooks",
  "docsDir": "./docs",
  "password": "rotate-this-password",
  "port": 8888
}
```

</Step>
<Step>
### Start the site

```bash
npx @o7z/zdoc
```

</Step>
<Step>
### Sign in through the generated login page

The login form posts to `/login`. On success, zdoc sets:

```text
docs_session=<random-token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800
```

</Step>
</Steps>

Complete runnable example:

```text
private-docs/
├── zdoc.config.json
└── docs/
    ├── _meta.yaml
    ├── index.md
    └── incident-response.md
```

```yaml title="docs/_meta.yaml"
title: Runbooks
pages:
  incident-response:
    title: Incident Response
    description: Steps for handling production incidents
```

```bash
cd private-docs
npx @o7z/zdoc
```

Operational notes derived from source:

- Sessions live only in the `Map` inside `src/lib/sessions.ts`.
- Restarting the process invalidates all current sessions because the secret is regenerated.
- There is no logout endpoint or session management UI.
- The gate is all-or-nothing; zdoc does not support per-page ACLs.

If you need to disable protection temporarily without editing the file, override the password from the command line:

```bash
zdoc --password ""
```

That works because `bin/cli.ts` tracks whether the flag was explicitly set and lets an empty string win over `zdoc.config.json`.

This model is appropriate when one shared password is acceptable and process restarts are infrequent. For anything more demanding, place zdoc behind an external authentication layer and leave `password` empty so the built-in hook becomes a pass-through.
