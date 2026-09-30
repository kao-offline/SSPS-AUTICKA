import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import assert from 'node:assert/strict';

const origin = process.argv[2] || 'https://li.kaooffline.top';
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL.trim());
const login = await client.action(api.auth.signIn,{provider:'password',params:{email:process.env.AUDIT_LOGIN_USERNAME,password:process.env.AUDIT_LOGIN_PASSWORD,flow:'signIn'}});
assert(login.tokens?.token, 'Login must issue a token');
client.setAuth(login.tokens.token);
const user = await client.query(api.users.currentUser,{});
assert.equal(user.role,'admin');
assert.equal(user.isApproved,true);
console.log('PASS admin login and verified profile');
for (const path of ['/login','/dashboard','/']) {
  const response=await fetch(origin+path);
  assert.equal(response.status,200,path);
}
console.log('PASS deployed pages');
for (const [path,body,status] of [
  ['/api/parking-spaces/getSpaces',undefined,401],
  ['/api/server/poll',{},401],
  ['/api/server/direct',{},401],
  ['/api/clean-invalid-plugins',{},401],
]) {
  const response=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  assert.equal(response.status,status,path);
}
assert.equal((await fetch(origin+'/api/parking-spaces/getSpaces',{headers:{'x-api-key':'invalid'}})).status,401);
console.log('PASS anonymous and invalid-key API rejection');
await client.query(api.context.getAllUsers,{});
await client.query(api.context.getAllPlugins,{});
await client.query(api.servers.listServers,{});
await client.query(api.servers.listMarketplaceModules,{});
console.log('PASS admin users, plugins, servers, and marketplace queries');
let keyId;
try {
  const key=await client.mutation(api.apiKeys.generateKey,{name:'audit-smoke-temporary',scopes:['api:call'],allowedPlugins:['parking-spaces'],allowedEndpoints:['parking-spaces/getSpaces']});
  keyId=(await client.query(api.apiKeys.listKeys,{})).find(k=>k.key===key)._id;
  const snapshot=await fetch(origin+'/api/parking-spaces/getSpaces',{headers:{'x-api-key':key}});
  assert.equal(snapshot.status,200);
  assert.equal((await snapshot.json()).success,true);
  const forbidden=await fetch(origin+'/api/parking-spaces/getMap',{headers:{'x-api-key':key}});
  assert.equal(forbidden.status,403);
  await client.mutation(api.apiKeys.revokeKey,{id:keyId});
  assert.equal((await fetch(origin+'/api/parking-spaces/getSpaces',{headers:{'x-api-key':key}})).status,401);
  console.log('PASS API key creation, scoped parking reads, forbidden endpoint, and immediate revocation');
} finally {
  if (keyId) {
    await client.mutation(api.apiKeys.revokeKey,{id:keyId});
    await client.mutation(api.apiKeys.deleteKey,{id:keyId});
  }
  await client.action(api.auth.signOut,{});
}
console.log('PASS cleanup and logout');
