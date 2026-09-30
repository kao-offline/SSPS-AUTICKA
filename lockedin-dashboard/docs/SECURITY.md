# Security and API authentication

Login uses Convex Auth with normalized usernames. New passwords use bcrypt; historical Scrypt hashes remain supported. Registration is separate from approval. Data access requires an approved, active user; administration checks the stored role. UI visibility is not an authorization boundary.

`context`, `spaces`, `securedApi`, and `securedSpaces` enforce backend authorization. Maintenance and reset helpers are internal functions accessible through trusted deployment administration. Plugin operations check assignments; admin operations also check the role.

Server enrollment and polling use server-specific credentials defined by `servers.ts`. Dashboard proxy and cleanup routes require bearer authentication. Direct server calls require admin access and an allowed HTTPS tunnel hostname; redirects are rejected.

External plugin APIs accept `x-api-key` or bearer API keys. Permissions check the exact normalized plugin/endpoint, required scope, active plugin, rate limit, and revocation. Revocation is checked on every request. Queued calls do not retain raw API keys. Missing/invalid credentials return 401, insufficient permissions 403, and malformed JSON 400.

Public login/bootstrap metadata and Convex Auth endpoints intentionally remain public.

Plugins are executable JavaScript installed by administrators. Treat publishers and artifacts as trusted code. Camera streams and external server modules need their actual services/hardware checked separately.

Keep credentials in ignored environment files or hosting secret settings. Never expose signing keys through `NEXT_PUBLIC_*`. Admin recovery writes `.env.admin-login`; see the README. A password reset does not promise immediate revocation of every existing JWT; disabling an account immediately denies application-data access.

The [audit report](AUDIT-2026-09-30.md) records verification and limitations.
