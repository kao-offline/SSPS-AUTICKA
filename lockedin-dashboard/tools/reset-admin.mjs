import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const deployment = process.argv[2];
if (!deployment) throw new Error('Usage: npm run create-admin -- <deployment-name> [username]');
const username = process.argv[3] || 'admin';
const password = randomBytes(24).toString('base64url');
const cli = fileURLToPath(new URL('../node_modules/convex/dist/cli.bundle.cjs', import.meta.url));
execFileSync(process.execPath, [cli, 'run', 'fixAdmin:fixAdminUser', JSON.stringify({username,password}), '--deployment-name', deployment], {stdio:['ignore','pipe','pipe']});
await writeFile('.env.admin-login', `AUDIT_LOGIN_USERNAME=${username}\nAUDIT_LOGIN_PASSWORD=${password}\n`, {mode:0o600});
console.log('Admin login reset. Credentials saved to ignored file .env.admin-login.');
