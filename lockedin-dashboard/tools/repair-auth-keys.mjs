import { createPrivateKey, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const deployment = process.argv[2];
if (!deployment) throw new Error('Usage: node tools/repair-auth-keys.mjs <deployment-name>');
const cli = fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url));
const run = args => execFileSync(process.execPath, [cli, ...args, '--deployment-name', deployment], {encoding:'utf8',stdio:['ignore','pipe','pipe']});
const raw = run(['env','get','JWT_PRIVATE_KEY']);
let key = raw.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\\n/g, '\n');
const body = key.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
key = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
const privateKey = createPrivateKey(key);
const jwk = createPublicKey(privateKey).export({format:'jwk'});
run(['env','set','JWKS',JSON.stringify({keys:[{...jwk,use:'sig',alg:'RS256'}]})]);
console.log('Matching public JWKS configured; private key retained.');
