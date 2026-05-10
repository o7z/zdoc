# AGENTS.md

## A11y discipline

**Never suppress ARIA / a11y warnings with ignore comments.** Fix them with proper keyboard handlers, roles, or semantic elements instead. This project follows WCAG 2.1 AA guidelines; accessibility is not optional.

## Package manager: pnpm

* Always use `pnpm` for install / add / run commands.
* Never use `npm` or `bun` — their lock files (`package-lock.json`, `bun.lock`) must not be introduced.
* pnpm enforces strict dependency declarations — any import that breaks means the package is missing from `dependencies` / `devDependencies` and must be explicitly added.

## Major-change gate

When the user proposes a change, **before implementing** check if it qualifies as a MAJOR breaking change:

- Delete / rename a public CLI option
- Config file format upgrade that is not backward-compatible
- Remove a published API endpoint
- Breaking structural change to sidebar rendering
- Require users to modify their config or documentation for the project to work correctly

If **any** of the above applies:
1. **Warn the user explicitly** that this is a breaking change requiring a major version bump
2. Suggest adding it to `docs/dev/next-major.md` backlog instead of implementing immediately
3. **Wait for user decision**: implement now (accept major bump) vs. park in backlog

If uncertain, err on the side of asking.
