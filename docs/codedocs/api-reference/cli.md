---
title: "CLI"
description: "The public command-line interface exposed by the zdoc package."
---

`zdoc` exposes one public entry point: the `zdoc` executable declared in `package.json` and implemented in `bin/cli.ts`.

## Source

- Package command: `zdoc`
- Source file: `bin/cli.ts`
- Runtime artifact: `bin/cli.js`

## Command Signature

```text
zdoc [options]
```

## Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `-d`, `--dir` | `string` | `process.cwd()` | Docs directory to serve |
| `-p`, `--port` | `number` | `8888` | Starting port; auto-increments if the requested port is unavailable |
| `-t`, `--title` | `string` | `Docs` | Site title passed through `ZDOC_TITLE` |
| `-w`, `--password` | `string` | `""` | Whole-site password; empty string disables auth |
| `-h`, `--help` | flag | — | Print the help text and exit |
| `-v`, `--version` | flag | — | Print the package version and exit |

## Behavior

- Reads `zdoc.config.json` from the current working directory
- Resolves configuration with CLI flags taking precedence
- Validates ports are integers between `1` and `65535`
- Finds a free port starting from the requested port
- Sets `ZDOC_DIR`, `ZDOC_PASSWORD`, `ZDOC_TITLE`, `PORT`, and `HOST`
- Imports `build/index.js`

Internally, `bin/cli.ts` also tracks whether `dir`, `port`, `password`, and `title` were explicitly set on the command line. That detail matters because an empty password is still a meaningful override. The implementation stores those markers on the parsed args object before resolving precedence.

## Example

```bash
zdoc -d ./docs -p 3000 -t "Operations Handbook" -w hunter2
```

Common composition pattern:

```bash
zdoc --dir ./docs --password ""
```

That is useful when `zdoc.config.json` already defines the docs directory and title, but you want to disable auth for a temporary local session.

The command also prints the resolved docs path, final bound port, and whether password protection is enabled. If the requested port is occupied, always trust the printed `Local` URL over the original `--port` value.

## Related Modules

- [Config](/docs/api-reference/config)
- [Docs Dir](/docs/api-reference/docs-dir)
- [Routing Runtime](/docs/api-reference/routing-runtime)
