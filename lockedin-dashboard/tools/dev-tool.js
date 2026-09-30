async function main() {
  const { execFileSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const [command, deployment, username] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log('Commands: auth:create <deployment> [username], auth:sudo <deployment> <username>, env:repair-keys <deployment>');
    return;
  }
  if (!deployment) throw new Error('An explicit Convex deployment name is required');
  if (command === 'auth:create') {
    execFileSync(process.execPath, [resolve(__dirname,'reset-admin.mjs'),deployment,username || 'admin'], {stdio:'inherit'});
  } else if (command === 'env:repair-keys') {
    execFileSync(process.execPath, [resolve(__dirname,'repair-auth-keys.mjs'),deployment], {stdio:'inherit'});
  } else if (command === 'auth:sudo') {
    if (!username) throw new Error('Username required');
    execFileSync(process.execPath, [resolve(__dirname,'../node_modules/convex/bin/main.js'),'run','fixAdmin:setAdminRole',JSON.stringify({username}),'--deployment-name',deployment], {stdio:'inherit'});
  } else {
    throw new Error('Unknown command; use --help');
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
