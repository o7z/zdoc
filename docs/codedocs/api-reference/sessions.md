---
title: "Sessions"
description: "In-memory session creation and validation for zdoc’s password-protected mode."
---

This module lives at `src/lib/sessions.ts` and is imported internally as `$lib/sessions.js`.

## Exported Functions

```ts
export function createSession(): { token: string; maxAge: number }
```

```ts
export function validateSession(token: string): boolean
```

## Parameters

### `createSession`

This function takes no parameters.

### `validateSession`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `token` | `string` | — | Raw cookie token from `docs_session` |

## Return Types

| Function | Return type | Description |
|----------|-------------|-------------|
| `createSession` | `{ token: string; maxAge: number }` | New random token plus the cookie max age in seconds |
| `validateSession` | `boolean` | Whether the token exists and is unexpired |

## Example

```ts
import { createSession, validateSession } from '$lib/sessions.js';

const { token, maxAge } = createSession();
console.log(maxAge);
console.log(validateSession(token));
```

Typical use inside the hook:

```ts
const { token, maxAge } = createSession();

return new Response(null, {
  status: 303,
  headers: {
    'Set-Cookie': `docs_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
    Location: '/',
  },
});
```

## Behavior

- `SESSION_TTL_SECONDS` is hardcoded to `60 * 60 * 24 * 7`
- tokens are hashed as `sha256(token + secret)` before storage
- `secret` is generated once per process with `randomBytes(32)`
- expired sessions are removed lazily during creation and validation

The storage model is intentionally ephemeral. `createSession()` does not write to disk, and `validateSession()` can only succeed for tokens issued by the current process. That is why a restart logs every user out even if their browser cookie is still present.

This module is intentionally narrow: it knows nothing about requests, cookies, usernames, or permissions. All HTTP concerns stay in `src/hooks.server.ts`, while `src/lib/sessions.ts` only manages token lifecycle.

That separation keeps the authentication hook easy to read. The hook owns redirect behavior and cookie formatting, while the session module owns expiry, hashing, and token issuance. For a codebase this small, that boundary is enough to keep auth concerns understandable without introducing a heavier abstraction.

## Related Modules

- [Routing Runtime](/docs/api-reference/routing-runtime)
- [Auth and Routing](/docs/auth-and-routing)
