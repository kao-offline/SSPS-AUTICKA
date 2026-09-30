# LockedIN dashboard

Next.js, React, and Convex dashboard for the SSPS parking system.

Production: https://li.kaooffline.top/login. Cloudflare forwards this hostname to the existing Vercel application. Production Convex is `combative-cat-787`; local development uses the deployment configured in `.env.local`.

## Development

Use npm (`package-lock.json` is authoritative):

```sh
npm ci
npx convex dev
npm run dev
```

Set `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` in `.env.local`. Convex Auth requires deployment-side `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`. Never commit these values. New registrations require approval. The first registration becomes an admin only on an empty installation.

## Admin recovery

Run from this directory, using a logged-in Convex CLI and an explicitly chosen deployment:

```sh
npm run create-admin -- <deployment-name> admin
```

This resets or creates an approved admin. The random password is saved to the ignored `.env.admin-login` file and never printed. This is a local credential file, not frontend configuration.

To derive missing public JWKS from the existing private signing key:

```sh
node tools/repair-auth-keys.mjs <deployment-name>
```

## Validation

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm audit
```

`npm run validate` stops on the first failed check. The audit report records outstanding lint failures.

For live checks, load the local admin credential file and the intended `NEXT_PUBLIC_CONVEX_URL` into the process environment, then run `node tools/smoke-deployed.mjs https://li.kaooffline.top`. This creates and removes a temporary restricted API key.

## Deployment

Vercel's project root is `lockedin-dashboard`. Run `npx vercel deploy .. --prod --yes` from this directory. Deploy Convex separately: `npx convex deploy --env-file <production-env-file> --yes`.

The hostname route is configured in `../deploy/cloudflare/wrangler.jsonc`. Deploy with `npx wrangler deploy --config ../deploy/cloudflare/wrangler.jsonc`. It uses existing wildcard DNS and worker permissions; DNS-edit access is unnecessary. Keep the Vercel origin alias available.

See [security notes](docs/SECURITY.md) and [the audit report](docs/AUDIT-2026-09-30.md).
