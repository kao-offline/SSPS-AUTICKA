import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { canKeyAccessEndpoint } from '../convex/apiKeys';

const modules = import.meta.glob('../convex/**/*.ts');

async function fixture(role = 'admin', isApproved = true) {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert('users', {
    username: 'tester', email: 'tester', isApproved,
    usrData: JSON.stringify({ role, isActive: true, plugins: 'parking-spaces' }),
  }));
  const user = t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` });
  return { t, user, userId };
}

describe('authorization', () => {
  test('anonymous users cannot read users, issue uploads, or write plugin data', async () => {
    const {t} = await fixture();
    await expect(t.query(api.context.getAllUsers, {})).rejects.toThrow('Unauthorized');
    await expect(t.mutation(api.context.generateUploadUrl, {})).rejects.toThrow('Unauthorized');
    await expect(t.mutation(api.pluginFramework.setPluginData, {pluginName:'parking-spaces',key:'x',value:'{}'})).rejects.toThrow('Unauthorized');
  });
  test('ordinary users cannot approve accounts or edit admin metadata', async () => {
    const {user, userId} = await fixture('user');
    await expect(user.mutation(api.context.approveAccount, {userId})).rejects.toThrow('Admin');
    await expect(user.action(api.context.updateUserAction, {userId,usrData:'{"role":"admin"}'})).rejects.toThrow('Admin');
  });
  test('pending accounts cannot access data even with a session', async () => {
    const {user} = await fixture('user', false);
    await expect(user.query(api.context.getAllPlugins, {})).rejects.toThrow('not approved');
  });
  test('plugin access is limited to assigned plugins', async () => {
    const {user} = await fixture('user');
    await expect(user.query(api.pluginFramework.getPluginData,{pluginName:'other-plugin',key:'x'})).rejects.toThrow('not assigned');
    expect(await user.query(api.pluginFramework.getPluginData,{pluginName:'parking-spaces',key:'x'})).toBeNull();
  });
});

describe('account management', () => {
  test('username changes update the password login account atomically', async () => {
    const {t,user,userId} = await fixture('user');
    const accountId = await t.run(ctx=>ctx.db.insert('authAccounts',{userId,provider:'password',providerAccountId:'tester',secret:'hash'}));
    await user.mutation(api.users.updateCurrentUsername,{username:'  NewName  '});
    expect((await t.run(ctx=>ctx.db.get(accountId)))?.providerAccountId).toBe('newname');
    expect((await t.run(ctx=>ctx.db.get(userId)))?.username).toBe('newname');
  });
  test('duplicate usernames cannot replace another login', async () => {
    const {t,user} = await fixture('user');
    await t.run(ctx=>ctx.db.insert('users',{username:'taken',email:'taken'}));
    await expect(user.mutation(api.users.updateCurrentUsername,{username:'taken'})).rejects.toThrow('already exists');
  });
  test('admin-created accounts are approved and can be edited through the action', async () => {
    const {t,user} = await fixture();
    const id = await user.action(api.context.createUserAction,{username:'created',password:'test-password-123',usrData:'{"role":"user"}'});
    expect((await t.run(ctx=>ctx.db.get(id as Id<'users'>)))?.isApproved).toBe(true);
    await user.action(api.context.updateUserAction,{userId:id,username:'renamed',usrData:'{"role":"user"}'});
    const accounts=await t.run(ctx=>ctx.db.query('authAccounts').collect());
    expect(accounts.find(a=>a.userId===id)?.providerAccountId).toBe('renamed');
  });
});

describe('API keys and parking', () => {
  test('endpoint restrictions compare whole paths and require scopes', () => {
    const key={isActive:true,scopes:['api:call'],allowedEndpoints:['parking-spaces/getMap']};
    expect(canKeyAccessEndpoint(key,'/api/parking-spaces/getMap',['api:call'])).toBe(true);
    expect(canKeyAccessEndpoint(key,'/api/parking-spaces/get',['api:call'])).toBe(false);
    expect(canKeyAccessEndpoint({...key,blockedEndpoints:['/api/parking-spaces/getMap']},'parking-spaces/getMap')).toBe(false);
    expect(canKeyAccessEndpoint({...key,scopes:[]},'parking-spaces/getMap',['api:call'])).toBe(false);
  });
  test('invalid IoT keys cannot mutate parking or vehicle history', async () => {
    const {t} = await fixture();
    await expect(t.mutation(api.iot.updateSpaceStatus,{apiKey:'invalid',spaceName:'A1',isFull:true})).rejects.toThrow('Invalid');
    await expect(t.mutation(api.iot.logCarEntry,{apiKey:'invalid',licensePlate:'TEST',direction:'in'})).rejects.toThrow('Invalid');
    expect(await t.run(ctx=>ctx.db.query('spaces').collect())).toHaveLength(0);
  });
  test('revoked and plugin-restricted keys are denied', async () => {
    const {t,userId} = await fixture();
    await t.run(ctx=>ctx.db.insert('apiKeys',{key:'restricted',name:'test',createdBy:userId,createdAt:Date.now(),isActive:true,scopes:['api:call'],allowedPlugins:['other']}));
    await expect(t.query(api.pluginApi.getParkingMapSnapshotAuthed,{pluginName:'parking-spaces',apiKey:'restricted'})).rejects.toThrow('Plugin not allowed');
    await expect(t.query(api.pluginApi.getParkingMapSnapshotAuthed,{pluginName:'other',apiKey:'restricted'})).rejects.toThrow('Invalid plugin');
  });
  test('parking writes update snapshots and enforce revocation', async () => {
    const {t,userId} = await fixture();
    const keyId=await t.run(ctx=>ctx.db.insert('apiKeys',{key:'parking-key',name:'test',createdBy:userId,createdAt:Date.now(),isActive:true,scopes:['api:call']}));
    await t.run(ctx=>ctx.db.insert('pluginData',{pluginName:'parking-spaces',key:'parking-config',value:JSON.stringify({spaces:[{id:'A1',name:'A1',isFull:false}]}),createdAt:Date.now(),updatedAt:Date.now()}));
    await t.mutation(api.pluginApi.updateParkingSpaceStatusAuthed,{pluginName:'parking-spaces',apiKey:'parking-key',spaceId:'A1',isFull:true});
    const result=await t.query(api.pluginApi.getParkingSpacesSnapshotAuthed,{pluginName:'parking-spaces',apiKey:'parking-key'});
    expect(result.counts.occupied).toBe(1);
    await t.run(ctx=>ctx.db.patch(keyId,{isActive:false}));
    await expect(t.query(api.pluginApi.getParkingSpacesSnapshotAuthed,{pluginName:'parking-spaces',apiKey:'parking-key'})).rejects.toThrow('Invalid API key');
  });
  test('rate limiting resets the request count in a new window', async () => {
    const {t,userId} = await fixture();
    const keyId=await t.run(ctx=>ctx.db.insert('apiKeys',{key:'iot-key',name:'test',createdBy:userId,createdAt:Date.now(),isActive:true,scopes:['data:write'],rateLimit:1,requestCount:1,rateLimitWindow:Date.now()-61000}));
    await t.mutation(api.iot.updateSpaceStatus,{apiKey:'iot-key',spaceName:'A1',isFull:true});
    expect((await t.run(ctx=>ctx.db.get(keyId)))?.requestCount).toBe(1);
    await expect(t.mutation(api.iot.updateSpaceStatus,{apiKey:'iot-key',spaceName:'A1',isFull:false})).rejects.toThrow('Invalid');
  });
  test('queued plugin calls do not persist the API key', async () => {
    const {t,userId} = await fixture();
    const fileId=await t.run(ctx=>ctx.storage.store(new Blob(['test'])));
    await t.run(ctx=>ctx.db.insert('plugins',{name:'demo',author:'test',version:'1',manifestFileId:fileId,coreFileId:fileId,uploadDate:Date.now(),isActive:true,apiEndpoints:['update']}));
    await t.run(ctx=>ctx.db.insert('apiKeys',{key:'secret-api-key',name:'test',createdBy:userId,createdAt:Date.now(),isActive:true,scopes:['api:call']}));
    const response=await t.mutation(api.pluginApi.handlePluginApiCall,{pluginAlias:'demo',endpoint:'update',method:'POST',body:'{}',queryParams:'{}',apiKey:'secret-api-key'});
    expect(response.success).toBe(true);
    const records=await t.run(ctx=>ctx.db.query('pluginData').collect());
    expect(records[0].value).not.toContain('secret-api-key');
  });
});

describe('server binding and shared data', () => {
  test('servers bind through admin and require their token to poll', async () => {
    const {t,user} = await fixture();
    expect(await t.mutation(api.servers.helloFromServer,{serverInstanceId:'test-server',bindKeyHash:'test-bind-hash'})).toEqual({status:'pending'});
    await expect(t.mutation(api.servers.bindPendingServer,{bindKeyHash:'test-bind-hash'})).rejects.toThrow('Unauthorized');
    const binding=await user.mutation(api.servers.bindPendingServer,{bindKeyHash:'test-bind-hash',name:'Test server'});
    const hello=await t.mutation(api.servers.helloFromServer,{serverInstanceId:'test-server',bindKeyHash:'test-bind-hash'});
    expect(hello.status).toBe('bound');
    await expect(t.mutation(api.servers.pollFromServer,{token:'invalid'})).rejects.toThrow('Invalid server token');
    const poll=await t.mutation(api.servers.pollFromServer,{token:binding.token});
    expect(poll.serverId).toBe(binding.serverId);
    expect(poll.modules).toEqual([]);
  });
  test('unassigned plugins cannot impersonate a private shared-data recipient', async () => {
    const {t,user} = await fixture('user');
    await t.run(ctx=>ctx.db.insert('pluginSharedData',{ownerPlugin:'owner',channel:'private',key:'secret',value:'private-value',visibility:'private',targetPlugin:'other',createdAt:Date.now(),updatedAt:Date.now()}));
    await expect(user.query(api.pluginFramework.readSharedChannelData,{requesterPlugin:'other',channel:'private'})).rejects.toThrow('not assigned');
    expect(await user.query(api.pluginFramework.readSharedChannelData,{requesterPlugin:'parking-spaces',channel:'private'})).toEqual([]);
  });
});
