async function main() {
  const { ConvexHttpClient } = await import('convex/browser');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const [command, pluginName] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log('Commands: list, sync. Load NEXT_PUBLIC_CONVEX_URL, AUDIT_LOGIN_USERNAME and AUDIT_LOGIN_PASSWORD using node --env-file.');
    return;
  }
  const url=process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url || !process.env.AUDIT_LOGIN_USERNAME || !process.env.AUDIT_LOGIN_PASSWORD) throw new Error('Backend URL and admin login are required');
  const client=new ConvexHttpClient(url);
  const login=await client.action('auth:signIn',{provider:'password',params:{email:process.env.AUDIT_LOGIN_USERNAME,password:process.env.AUDIT_LOGIN_PASSWORD,flow:'signIn'}});
  if (!login.tokens?.token) throw new Error('Admin login failed');
  client.setAuth(login.tokens.token);
  try {
    const plugins=await client.query('context:getAllPlugins',{});
    if (command==='list') {
      console.table(plugins.map(p=>({name:p.name,version:p.version,isActive:p.isActive})));
    } else if (command==='sync' || command==='update') {
      for (const plugin of plugins.filter(p=>!pluginName || p.name===pluginName)) {
        let manifest;
        if (command==='update') {
          if (!pluginName || /[/\\]|\.\./.test(pluginName)) throw new Error('A valid plugin name is required');
          manifest=JSON.parse(await fs.readFile(path.resolve(__dirname,'../test-plugin-files',pluginName,'manifest.json'),'utf8'));
        } else {
          const url=await client.query('context:getFileUrl',{fileId:plugin.manifestFileId});
          const response=await fetch(url);
          if (!response.ok) throw new Error('Manifest download failed');
          manifest=await response.json();
        }
        const endpoints=Array.isArray(manifest.apiEndpoints)?manifest.apiEndpoints:[];
        await client.mutation('pluginFramework:registerPluginApiEndpoints',{pluginName:plugin.name,endpoints});
        console.log('Updated endpoints:',plugin.name);
      }
    } else throw new Error('Unknown command; use --help');
  } finally { await client.action('auth:signOut',{}); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
