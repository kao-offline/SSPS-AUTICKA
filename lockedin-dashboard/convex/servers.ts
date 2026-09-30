import { ConvexError } from "convex/values";
﻿import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkAdmin } from "./permissions";

function generateToken(prefix: string, length = 40) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function safeJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.stringify(value);
}

function parseManifest(manifestText: string | null | undefined) {
  if (!manifestText) return null;
  try {
    return JSON.parse(manifestText);
  } catch {
    return null;
  }
}

async function uninstallServerModuleRecord(ctx: any, record: any) {
  await ctx.db.patch(record.apiKeyId, { isActive: false });
  await ctx.db.delete(record.apiKeyId);
  await ctx.db.delete(record._id);
}

async function uninstallModulesByMarketplace(ctx: any, marketplaceId: any) {
  const all = await ctx.db.query("serverModules").collect();
  const matches = all.filter((m: any) => String(m.marketplaceId) === String(marketplaceId));

  for (const m of matches) {
    await uninstallServerModuleRecord(ctx, m);
  }

  return matches.length;
}

export const assertAdmin = query({
  args: {},
  handler: async (ctx) => {
    await checkAdmin(ctx);
    return true;
  },
});

function extractPublicIp(serverInfo: unknown, explicit?: string | null): string | undefined {
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  if (serverInfo && typeof serverInfo === "object" && (serverInfo as any).publicIp) {
    const ip = String((serverInfo as any).publicIp).trim();
    if (ip) return ip;
  }
  return undefined;
}

export const helloFromServer = mutation({
  args: {
    serverInstanceId: v.string(),
    bindKeyHash: v.string(),
    serverInfo: v.optional(v.any()),
    capabilities: v.optional(v.any()),
    publicIp: v.optional(v.string()),
    tunnelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const publicIp = extractPublicIp(args.serverInfo, args.publicIp);

    const existing = await ctx.db
      .query("pendingServers")
      .withIndex("by_instance", (q) => q.eq("serverInstanceId", args.serverInstanceId))
      .first();

    if (!existing) {
      await ctx.db.insert("pendingServers", {
        serverInstanceId: args.serverInstanceId,
        bindKeyHash: args.bindKeyHash,
        createdAt: now,
        lastSeen: now,
        serverInfo: safeJson(args.serverInfo),
        capabilities: safeJson(args.capabilities),
        publicIp,
        tunnelUrl: args.tunnelUrl,
      });
      return { status: "pending" as const };
    }

    if (existing.bindKeyHash !== args.bindKeyHash) {
      throw new ConvexError("bindKeyHash mismatch");
    }

    await ctx.db.patch(existing._id, {
      lastSeen: now,
      serverInfo: safeJson(args.serverInfo),
      capabilities: safeJson(args.capabilities),
      ...(publicIp !== undefined && publicIp !== existing.publicIp ? { publicIp } : {}),
      ...(args.tunnelUrl !== undefined && args.tunnelUrl !== (existing as any).tunnelUrl
        ? { tunnelUrl: args.tunnelUrl }
        : {}),
    });

    if (!existing.boundServerId) {
      return { status: "pending" as const };
    }

    const server = await ctx.db.get(existing.boundServerId);
    if (!server) {
      return { status: "pending" as const };
    }

    return {
      status: "bound" as const,
      serverId: server._id,
      token: server.token,
    };
  },
});

export const pollFromServer = mutation({
  args: {
    token: v.string(),
    status: v.optional(v.string()),
    serverInfo: v.optional(v.any()),
    publicIp: v.optional(v.string()),
    tunnelUrl: v.optional(v.string()),
    // Delta sync: device tells us which versions it already runs.
    // Cloud then skips storage.getUrl + apiKey lookups for unchanged modules.
    knownModules: v.optional(v.array(v.object({ moduleId: v.string(), version: v.optional(v.string()) }))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const server = await ctx.db
      .query("servers")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!server) {
      throw new ConvexError("Invalid server token");
    }

    const publicIp = extractPublicIp(args.serverInfo, args.publicIp);
    const patch: Record<string, unknown> = { lastSeen: now, status: args.status };
    if (args.serverInfo !== undefined) patch.serverInfo = safeJson(args.serverInfo);
    if (publicIp !== undefined && publicIp !== server.publicIp) patch.publicIp = publicIp;
    if (args.tunnelUrl !== undefined && args.tunnelUrl !== (server as any).tunnelUrl) {
      patch.tunnelUrl = args.tunnelUrl;
    }
    await ctx.db.patch(server._id, patch);

    const modules = await ctx.db
      .query("serverModules")
      .withIndex("by_server", (q) => q.eq("serverId", server._id))
      .collect();

    const known = new Map<string, string>();
    for (const k of args.knownModules ?? []) {
      known.set(k.moduleId, String(k.version ?? ""));
    }
    const useDelta = args.knownModules !== undefined;
    const desiredIds = new Set(modules.map((m) => m.moduleId));
    const removed = useDelta
      ? [...known.keys()].filter((id) => !desiredIds.has(id))
      : [];

    const modulesResolved = [] as Array<Record<string, unknown>>;
    const unchanged = [] as string[];
    for (const m of modules) {
      const currentVersion = String(m.version ?? "");
      if (useDelta && known.get(m.moduleId) === currentVersion) {
        unchanged.push(m.moduleId);
        continue;
      }
      const apiKey = await ctx.db.get(m.apiKeyId);
      const artifactUrl = m.artifactFileId ? await ctx.storage.getUrl(m.artifactFileId) : null;

      modulesResolved.push({
        moduleId: m.moduleId,
        name: m.name,
        version: m.version ?? null,
        entrypoint: m.entrypoint ?? null,
        status: m.status ?? "unknown",
        updatedAt: m.updatedAt,
        manifest: m.manifest ?? null,
        artifactUrl,
        apiKey: apiKey?.key ?? null,
        desiredConfig: m.desiredConfig ?? null,
      });
    }

    return {
      serverId: server._id,
      rt: { enabled: false },
      commands: [] as Array<Record<string, unknown>>,
      modules: modulesResolved,
      ...(useDelta ? { unchanged, removed } : {}),
    };
  },
});

export const listPendingServers = query({
  args: {},
  handler: async (ctx) => {
    await checkAdmin(ctx);
    const pending = await ctx.db.query("pendingServers").collect();
    return pending
      .filter((p) => !p.boundServerId)
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .map((p) => ({
        _id: p._id,
        serverInstanceId: p.serverInstanceId,
        createdAt: p.createdAt,
        lastSeen: p.lastSeen,
        serverInfo: p.serverInfo ?? null,
        capabilities: p.capabilities ?? null,
        publicIp: (p as any).publicIp ?? null,
        tunnelUrl: (p as any).tunnelUrl ?? null,
      }));
  },
});

export const listServers = query({
  args: {},
  handler: async (ctx) => {
    await checkAdmin(ctx);
    const servers = await ctx.db.query("servers").collect();

    const modules = await ctx.db.query("serverModules").collect();
    const countByServer = new Map<string, number>();
    for (const m of modules) {
      countByServer.set(String(m.serverId), (countByServer.get(String(m.serverId)) ?? 0) + 1);
    }

    return servers
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .map((s) => ({
        _id: s._id,
        name: s.name ?? null,
        serverInstanceId: s.serverInstanceId,
        createdAt: s.createdAt,
        lastSeen: s.lastSeen,
        status: s.status ?? null,
        modulesCount: countByServer.get(String(s._id)) ?? 0,
        serverInfo: s.serverInfo ?? null,
        capabilities: s.capabilities ?? null,
        publicIp: (s as any).publicIp ?? null,
        tunnelUrl: (s as any).tunnelUrl ?? null,
      }));
  },
});

export const bindPendingServer = mutation({
  args: {
    bindKeyHash: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await checkAdmin(ctx);
    const now = Date.now();

    const pending = await ctx.db
      .query("pendingServers")
      .withIndex("by_bindKeyHash", (q) => q.eq("bindKeyHash", args.bindKeyHash))
      .first();

    if (!pending) {
      throw new ConvexError("No pending server for this bind key");
    }

    if (pending.boundServerId) {
      throw new ConvexError("Server already bound");
    }

    const token = generateToken("sv_");

    const serverId = await ctx.db.insert("servers", {
      serverInstanceId: pending.serverInstanceId,
      name: args.name?.trim() || undefined,
      token,
      createdAt: now,
      lastSeen: now,
      serverInfo: pending.serverInfo,
      capabilities: pending.capabilities,
      publicIp: (pending as any).publicIp,
      tunnelUrl: (pending as any).tunnelUrl,
      status: "online",
    });

    await ctx.db.patch(pending._id, { boundServerId: serverId });

    return {
      serverId,
      token,
      boundBy: user._id,
    };
  },
});

export const upsertMarketplaceModule = mutation({
  args: {
    moduleId: v.string(),
    name: v.string(),
    version: v.optional(v.string()),
    entrypoint: v.optional(v.string()),
    manifest: v.optional(v.string()),
    artifactFileId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await checkAdmin(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("serverMarketplaceModules")
      .withIndex("by_module_and_version", (q) =>
        q.eq("moduleId", args.moduleId).eq("version", args.version)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        entrypoint: args.entrypoint,
        manifest: args.manifest,
        artifactFileId: args.artifactFileId,
        uploadedAt: now,
        uploadedBy: user._id,
        isActive: true,
      });
      return { marketplaceId: existing._id };
    }

    const marketplaceId = await ctx.db.insert("serverMarketplaceModules", {
      moduleId: args.moduleId,
      name: args.name,
      version: args.version,
      entrypoint: args.entrypoint,
      manifest: args.manifest,
      artifactFileId: args.artifactFileId,
      uploadedAt: now,
      uploadedBy: user._id,
      isActive: true,
    });

    return { marketplaceId };
  },
});

export const setMarketplaceModuleActive = mutation({
  args: {
    marketplaceId: v.id("serverMarketplaceModules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const marketplace = await ctx.db.get(args.marketplaceId);
    if (!marketplace) {
      throw new ConvexError("Marketplace module not found");
    }

    if (args.isActive) {
      await ctx.db.patch(marketplace._id, {
        isActive: true,
      });
      return { success: true };
    }

    await ctx.db.patch(marketplace._id, {
      isActive: false,
      deactivatedAt: Date.now(),
    });

    const uninstalledCount = await uninstallModulesByMarketplace(ctx, marketplace._id);

    return { success: true, uninstalledCount };
  },
});

export const deleteMarketplaceModulePermanently = mutation({
  args: {
    marketplaceId: v.id("serverMarketplaceModules"),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const marketplace = await ctx.db.get(args.marketplaceId);
    if (!marketplace) {
      return { success: true };
    }

    const uninstalledCount = await uninstallModulesByMarketplace(ctx, marketplace._id);

    await ctx.storage.delete(marketplace.artifactFileId);
    await ctx.db.delete(marketplace._id);

    return { success: true, uninstalledCount };
  },
});

export const listMarketplaceModules = query({
  args: {},
  handler: async (ctx) => {
    await checkAdmin(ctx);
    const items = await ctx.db.query("serverMarketplaceModules").collect();

    return items
      .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0))
      .map((m) => {
        const parsed = parseManifest(m.manifest);
        const requestedPermissions = Array.isArray(parsed?.requestedPermissions)
          ? parsed.requestedPermissions
          : [];
        const allowedEndpoints = requestedPermissions
          .map((x: any) => String(x).trim())
          .filter(Boolean);

        return {
          _id: m._id,
          moduleId: m.moduleId,
          name: m.name,
          version: m.version ?? null,
          entrypoint: m.entrypoint ?? null,
          uploadedAt: m.uploadedAt,
          allowedEndpoints,
          isActive: m.isActive ?? true,
          deactivatedAt: m.deactivatedAt ?? null,
        };
      });
  },
});

async function createServerModuleInternal(
  ctx: any,
  args: {
    serverId: any;
    moduleId: string;
    name: string;
    version?: string;
    entrypoint?: string;
    manifest?: string;
    artifactFileId?: any;
    allowedEndpoints: string[];
    marketplaceId?: any;
    desiredConfig?: string;
  }
) {
  const user = await checkAdmin(ctx);
  const now = Date.now();

  const existing = await ctx.db
    .query("serverModules")
    .withIndex("by_server_and_module", (q: any) =>
      q.eq("serverId", args.serverId).eq("moduleId", args.moduleId)
    )
    .first();

  if (existing) {
    throw new ConvexError("Module already exists on this server");
  }

  if (args.allowedEndpoints.length === 0) {
    throw new ConvexError("At least one allowed endpoint is required");
  }

  const moduleKey = generateToken("lk_");

  const apiKeyId = await ctx.db.insert("apiKeys", {
    key: moduleKey,
    name: args.name,
    description: `SERVER module ${args.moduleId}`,
    createdBy: user._id,
    createdAt: now,
    isActive: true,
    kind: "SERVER_MODULE",
    serverId: args.serverId,
    serverModuleId: args.moduleId,
    scopes: ["api:call"],
    allowedEndpoints: args.allowedEndpoints,
    rateLimit: 0,
    requestCount: 0,
    rateLimitWindow: now,
  });

  await ctx.db.insert("serverModules", {
    serverId: args.serverId,
    moduleId: args.moduleId,
    name: args.name,
    version: args.version,
    entrypoint: args.entrypoint,
    manifest: args.manifest,
    artifactFileId: args.artifactFileId,
    marketplaceId: args.marketplaceId,
    desiredConfig: args.desiredConfig,
    allowedEndpoints: args.allowedEndpoints,
    apiKeyId,
    createdAt: now,
    updatedAt: now,
    status: "installed",
  });

  return {
    apiKey: moduleKey,
    apiKeyId,
  };
}

export const installMarketplaceModule = mutation({
  args: {
    serverId: v.id("servers"),
    marketplaceId: v.id("serverMarketplaceModules"),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const marketplace = await ctx.db.get(args.marketplaceId);
    if (!marketplace) {
      throw new ConvexError("Marketplace module not found");
    }

    if (marketplace.isActive === false) {
      throw new ConvexError("Marketplace module is deactivated");
    }

    const parsed = parseManifest(marketplace.manifest);

    const requestedPermissions = Array.isArray(parsed?.requestedPermissions)
      ? parsed.requestedPermissions
      : [];
    const allowedEndpoints = requestedPermissions
      .map((x: any) => String(x).trim())
      .filter(Boolean);

    if (allowedEndpoints.length === 0) {
      throw new ConvexError("Marketplace module missing requestedPermissions");
    }

    let desiredConfig: string | undefined;
    if (parsed?.defaultConfig !== undefined) {
      desiredConfig = JSON.stringify(parsed.defaultConfig);
    }

    return await createServerModuleInternal(ctx, {
      serverId: args.serverId,
      moduleId: marketplace.moduleId,
      name: marketplace.name,
      version: marketplace.version ?? undefined,
      entrypoint: marketplace.entrypoint ?? undefined,
      manifest: marketplace.manifest ?? undefined,
      artifactFileId: marketplace.artifactFileId,
      allowedEndpoints,
      marketplaceId: marketplace._id,
      desiredConfig,
    });
  },
});

export const listServerModules = query({
  args: {
    serverId: v.id("servers"),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const modules = await ctx.db
      .query("serverModules")
      .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
      .collect();

    return modules
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({
        _id: m._id,
        moduleId: m.moduleId,
        name: m.name,
        version: m.version ?? null,
        entrypoint: m.entrypoint ?? null,
        allowedEndpoints: m.allowedEndpoints,
        status: m.status ?? null,
        updatedAt: m.updatedAt,
        desiredConfig: m.desiredConfig ?? null,
        marketplaceId: m.marketplaceId ?? null,
      }));
  },
});

export const updateServerModuleDesiredConfig = mutation({
  args: {
    serverId: v.id("servers"),
    moduleId: v.string(),
    desiredConfig: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const record = await ctx.db
      .query("serverModules")
      .withIndex("by_server_and_module", (q) => q.eq("serverId", args.serverId).eq("moduleId", args.moduleId))
      .first();

    if (!record) {
      throw new ConvexError("Module not found");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(args.desiredConfig);
    } catch {
      throw new ConvexError("Config must be valid JSON");
    }

    const normalized = JSON.stringify(parsed);

    await ctx.db.patch(record._id, {
      desiredConfig: normalized,
      updatedAt: Date.now(),
      status: "installed",
    });

    return { success: true };
  },
});

export const createServerModule = mutation({
  args: {
    serverId: v.id("servers"),
    moduleId: v.string(),
    name: v.string(),
    version: v.optional(v.string()),
    entrypoint: v.optional(v.string()),
    manifest: v.optional(v.string()),
    artifactFileId: v.optional(v.id("_storage")),
    allowedEndpoints: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await createServerModuleInternal(ctx, {
      serverId: args.serverId,
      moduleId: args.moduleId,
      name: args.name,
      version: args.version,
      entrypoint: args.entrypoint,
      manifest: args.manifest,
      artifactFileId: args.artifactFileId,
      allowedEndpoints: args.allowedEndpoints,
    });
  },
});

export const removeServerModule = mutation({
  args: {
    serverId: v.id("servers"),
    moduleId: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const record = await ctx.db
      .query("serverModules")
      .withIndex("by_server_and_module", (q) => q.eq("serverId", args.serverId).eq("moduleId", args.moduleId))
      .first();

    if (!record) {
      return { success: true };
    }

    await uninstallServerModuleRecord(ctx, record);

    return { success: true };
  },
});