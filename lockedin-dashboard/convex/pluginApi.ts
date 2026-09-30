import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canKeyAccessEndpoint, validateKey } from "./apiKeys";
import { checkPluginAccess } from "./permissions";

const PARKING_CONFIG_KEY = "parking-config";

function createDefaultParkingConfig() {
  return {
    version: 2,
    mapFileName: null,
    mapMeta: null,
    spaces: [],
    updatedAt: Date.now(),
  };
}

async function getParkingConfigRecord(ctx: any, pluginName: string) {
  return await ctx.db
    .query("pluginData")
    .withIndex("by_plugin_and_key", (q: any) => q.eq("pluginName", pluginName).eq("key", PARKING_CONFIG_KEY))
    .first();
}

function parseParkingConfig(rawValue: string | null | undefined) {
  if (!rawValue) {
    return createDefaultParkingConfig();
  }

  try {
    const parsed = JSON.parse(rawValue);
    return {
      ...createDefaultParkingConfig(),
      ...parsed,
      spaces: Array.isArray(parsed?.spaces) ? parsed.spaces : [],
    };
  } catch {
    return createDefaultParkingConfig();
  }
}

async function getParkingMapUrl(ctx: any, pluginName: string, mapFileName: string | null | undefined) {
  if (!mapFileName) {
    return null;
  }

  const file = await ctx.db
    .query("pluginFiles")
    .withIndex("by_plugin_and_name", (q: any) => q.eq("pluginName", pluginName).eq("fileName", mapFileName))
    .first();

  if (!file) {
    return null;
  }

  return await ctx.storage.getUrl(file.fileId);
}

export const handlePluginApiCall = mutation({
  args: {
    pluginAlias: v.string(),
    endpoint: v.string(),
    method: v.string(),
    body: v.union(v.string(), v.null()),
    queryParams: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { pluginAlias, endpoint, method, body, queryParams, apiKey } = args;
    await _requireApiKeyForPath(ctx, apiKey, `/api/${pluginAlias}/${endpoint}`);
    const plugin = await ctx.db.query("plugins").withIndex("by_name", q => q.eq("name", pluginAlias)).first();
    if (!plugin || !plugin.apiEndpoints?.includes(endpoint)) throw new ConvexError("Not found: Plugin endpoint");
    if (!plugin.isActive) throw new ConvexError("Forbidden: Plugin is inactive");
    const keyValidation = await validateKey(ctx, apiKey);
    if (!keyValidation.valid) throw new ConvexError(keyValidation.reason);

    const callId = `apicall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const callData = {
      pluginAlias,
      endpoint,
      method,
      body: body ? JSON.parse(body) : null,
      queryParams: JSON.parse(queryParams),
      timestamp: Date.now(),
      status: "pending",
    };

    await ctx.db.insert("pluginData", {
      pluginName: pluginAlias,
      key: `api_call_${callId}`,
      value: JSON.stringify(callData),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      message: `API call to ${pluginAlias}/${endpoint} received`,
      callId,
      data: {
        pluginAlias,
        endpoint,
        method,
        timestamp: Date.now(),
      },
    };
  },
});

export const getApiCallResult = mutation({
  args: {
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const { callId } = args;

    const result = await ctx.db
      .query("pluginData")
      .filter((q) => q.eq(q.field("key"), `api_call_${callId}`))
      .first();

    if (!result) {
      return null;
    }

    try {
      await checkPluginAccess(ctx, result.pluginName);
      return JSON.parse(result.value);
    } catch {
      return null;
    }
  },
});

export const getParkingSpacesSnapshot = query({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);
    const record = await getParkingConfigRecord(ctx, args.pluginName);
    const config = parseParkingConfig(record?.value);
    const mapUrl = await getParkingMapUrl(ctx, args.pluginName, config.mapFileName);
    const occupied = config.spaces.filter((space: any) => space.isFull).length;

    return {
      success: true,
      pluginName: args.pluginName,
      mapFileName: config.mapFileName,
      mapUrl,
      mapMeta: config.mapMeta || null,
      counts: {
        total: config.spaces.length,
        occupied,
        available: config.spaces.length - occupied,
      },
      spaces: config.spaces,
      updatedAt: config.updatedAt || null,
    };
  },
});

export const getParkingMapSnapshot = query({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);
    const record = await getParkingConfigRecord(ctx, args.pluginName);
    const config = parseParkingConfig(record?.value);
    const mapUrl = await getParkingMapUrl(ctx, args.pluginName, config.mapFileName);

    return {
      success: true,
      pluginName: args.pluginName,
      mapFileName: config.mapFileName,
      mapUrl,
      mapMeta: config.mapMeta || null,
      updatedAt: config.updatedAt || null,
    };
  },
});

export const updateParkingSpaceStatusDirect = mutation({
  args: {
    pluginName: v.string(),
    spaceId: v.optional(v.string()),
    spaceName: v.optional(v.string()),
    status: v.optional(v.union(v.literal("full"), v.literal("empty"))),
    isFull: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);
    const record = await getParkingConfigRecord(ctx, args.pluginName);
    const config = parseParkingConfig(record?.value);
    const nextIsFull = typeof args.isFull === "boolean" ? args.isFull : args.status === "full";

    const index = config.spaces.findIndex((space: any) => {
      if (args.spaceId && space.id === args.spaceId) return true;
      if (args.spaceName && (space.name === args.spaceName || space.label === args.spaceName)) return true;
      return false;
    });

    if (index === -1) {
      throw new ConvexError("Parking space not found");
    }

    const updatedSpace = {
      ...config.spaces[index],
      isFull: nextIsFull,
      updatedAt: Date.now(),
    };
    config.spaces[index] = updatedSpace;
    config.updatedAt = Date.now();

    const value = JSON.stringify(config);
    if (record) {
      await ctx.db.patch(record._id, {
        value,
        updatedAt: config.updatedAt,
      });
    } else {
      await ctx.db.insert("pluginData", {
        pluginName: args.pluginName,
        key: PARKING_CONFIG_KEY,
        value,
        createdAt: config.updatedAt,
        updatedAt: config.updatedAt,
      });
    }

    const occupied = config.spaces.filter((space: any) => space.isFull).length;
    return {
      success: true,
      pluginName: args.pluginName,
      space: updatedSpace,
      counts: {
        total: config.spaces.length,
        occupied,
        available: config.spaces.length - occupied,
      },
      updatedAt: config.updatedAt,
    };
  },
});

// ============================================================================
// AUTHED PARKING API (single-call external API)
// ============================================================================

function _endpointAllowed(keyRecord: any, path: string) {
  return canKeyAccessEndpoint(keyRecord, path, ["api:call"]);
}

async function _requireApiKeyForPath(ctx: any, apiKey: string, path: string) {
  const keyRecord = await ctx.db
    .query("apiKeys")
    .withIndex("by_key", (q: any) => q.eq("key", apiKey))
    .first();

  if (!keyRecord || !keyRecord.isActive) {
    throw new ConvexError("Invalid API key");
  }

  if (!_endpointAllowed(keyRecord, path)) {
    throw new ConvexError("Forbidden: API key not allowed for this endpoint");
  }

  const pluginName = path.split('/')[2];
  if (keyRecord.allowedPlugins?.length && !keyRecord.allowedPlugins.includes(pluginName)) throw new ConvexError("Forbidden: Plugin not allowed");

  return keyRecord;
}

export const getParkingSpacesSnapshotAuthed = query({
  args: {
    pluginName: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.pluginName !== "parking-spaces") throw new ConvexError("Forbidden: Invalid plugin name");
    await _requireApiKeyForPath(ctx, args.apiKey, "/api/parking-spaces/getSpaces");

    const record = await getParkingConfigRecord(ctx, args.pluginName);
    const config = parseParkingConfig(record?.value);
    const mapUrl = await getParkingMapUrl(ctx, args.pluginName, config.mapFileName);
    const occupied = config.spaces.filter((space: any) => space.isFull).length;

    return {
      success: true,
      pluginName: args.pluginName,
      mapFileName: config.mapFileName,
      mapUrl,
      mapMeta: config.mapMeta || null,
      counts: {
        total: config.spaces.length,
        occupied,
        available: config.spaces.length - occupied,
      },
      spaces: config.spaces,
      updatedAt: config.updatedAt || null,
    };
  },
});

export const getParkingMapSnapshotAuthed = query({
  args: {
    pluginName: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.pluginName !== "parking-spaces") throw new ConvexError("Forbidden: Invalid plugin name");
    await _requireApiKeyForPath(ctx, args.apiKey, "/api/parking-spaces/getMap");

    const record = await getParkingConfigRecord(ctx, args.pluginName);
    const config = parseParkingConfig(record?.value);
    const mapUrl = await getParkingMapUrl(ctx, args.pluginName, config.mapFileName);

    return {
      success: true,
      pluginName: args.pluginName,
      mapFileName: config.mapFileName,
      mapUrl,
      mapMeta: config.mapMeta || null,
      updatedAt: config.updatedAt || null,
    };
  },
});

export const updateParkingSpaceStatusAuthed = mutation({
  args: {
    pluginName: v.string(),
    apiKey: v.string(),
    spaceId: v.optional(v.string()),
    spaceName: v.optional(v.string()),
    status: v.optional(v.union(v.literal("full"), v.literal("empty"))),
    isFull: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.pluginName !== "parking-spaces") throw new ConvexError("Forbidden: Invalid plugin name");
    await _requireApiKeyForPath(ctx, args.apiKey, "/api/parking-spaces/updateSpaceStatus");
    const validation = await validateKey(ctx, args.apiKey);
    if (!validation.valid) throw new ConvexError(validation.reason);
    if (!args.spaceId && !args.spaceName) throw new ConvexError("Bad request: Space identifier required");
    if (args.isFull === undefined && args.status === undefined) throw new ConvexError("Bad request: Status required");

    const record = await getParkingConfigRecord(ctx, args.pluginName);
    const config = parseParkingConfig(record?.value);
    const nextIsFull = typeof args.isFull === "boolean" ? args.isFull : args.status === "full";

    const index = config.spaces.findIndex((space: any) => {
      if (args.spaceId && space.id === args.spaceId) return true;
      if (args.spaceName && (space.name === args.spaceName || space.label === args.spaceName)) return true;
      return false;
    });

    if (index === -1) {
      throw new ConvexError("Parking space not found");
    }

    const updatedSpace = {
      ...config.spaces[index],
      isFull: nextIsFull,
      updatedAt: Date.now(),
    };
    config.spaces[index] = updatedSpace;
    config.updatedAt = Date.now();

    const value = JSON.stringify(config);
    if (record) {
      await ctx.db.patch(record._id, {
        value,
        updatedAt: config.updatedAt,
      });
    } else {
      await ctx.db.insert("pluginData", {
        pluginName: args.pluginName,
        key: PARKING_CONFIG_KEY,
        value,
        createdAt: config.updatedAt,
        updatedAt: config.updatedAt,
      });
    }

    const occupied = config.spaces.filter((space: any) => space.isFull).length;
    return {
      success: true,
      pluginName: args.pluginName,
      space: updatedSpace,
      counts: {
        total: config.spaces.length,
        occupied,
        available: config.spaces.length - occupied,
      },
      updatedAt: config.updatedAt,
    };
  },
});
