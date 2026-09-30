import { checkAuthenticated, checkAdmin, checkPluginAccess } from "./permissions";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, action, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Plugin Framework API
 * 
 * This file provides a comprehensive API for plugins to interact with the Convex database,
 * access user profile data, manage plugin-specific data and files, and handle role-based permissions.
 */

// ============================================================================
// PLUGIN DATA STORAGE API
// ============================================================================

/**
 * Set a key-value pair in plugin data storage
 */
export const setPluginData = mutation({
  args: {
    pluginName: v.string(),
    key: v.string(),
    value: v.string(), // JSON stringified value
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, key, value } = args;
    const now = Date.now();

    // Check if data already exists
    const existing = await ctx.db
      .query("pluginData")
      .withIndex("by_plugin_and_key", (q) => 
        q.eq("pluginName", pluginName).eq("key", key)
      )
      .first();

    if (existing) {
      // Update existing data
      await ctx.db.patch(existing._id, {
        value,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new data
      return await ctx.db.insert("pluginData", {
        pluginName,
        key,
        value,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Get a value from plugin data storage
 */
export const getPluginData = query({
  args: {
    pluginName: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, key } = args;
    
    const data = await ctx.db
      .query("pluginData")
      .withIndex("by_plugin_and_key", (q) => 
        q.eq("pluginName", pluginName).eq("key", key)
      )
      .first();

    return data ? data.value : null;
  },
});

/**
 * Get all data for a plugin
 */
export const getAllPluginData = query({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName } = args;
    
    const data = await ctx.db
      .query("pluginData")
      .withIndex("by_plugin", (q) => q.eq("pluginName", pluginName))
      .collect();

    return data;
  },
});

/**
 * Delete a key from plugin data storage
 */
export const deletePluginData = mutation({
  args: {
    pluginName: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, key } = args;
    
    const data = await ctx.db
      .query("pluginData")
      .withIndex("by_plugin_and_key", (q) => 
        q.eq("pluginName", pluginName).eq("key", key)
      )
      .first();

    if (data) {
      await ctx.db.delete(data._id);
      return true;
    }
    return false;
  },
});

/**
 * Clear all data for a plugin
 */
export const clearAllPluginData = mutation({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName } = args;
    
    const data = await ctx.db
      .query("pluginData")
      .withIndex("by_plugin", (q) => q.eq("pluginName", pluginName))
      .collect();

    for (const item of data) {
      await ctx.db.delete(item._id);
    }

    return { deleted: data.length };
  },
});

// ============================================================================
// PLUGIN FILE STORAGE API
// ============================================================================

/**
 * Store a file for a plugin
 */
export const storePluginFile = action({
  args: {
    pluginName: v.string(),
    fileName: v.string(),
    fileData: v.string(), // base64 encoded
    mimeType: v.string(),
    metadata: v.optional(v.string()), // JSON stringified metadata
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, fileName, fileData, mimeType, metadata } = args;
    const now = Date.now();

    try {
      // Handle data URLs and strip the base64 prefix if present
      let base64Data = fileData;
      if (fileData.startsWith('data:')) {
        // Extract base64 content from data URL (e.g., "data:image/png;base64,ABC123...")
        const matches = fileData.match(/base64,(.+)$/);
        if (matches && matches[1]) {
          base64Data = matches[1];
        } else {
          throw new Error('Invalid data URL format');
        }
      }

      // Decode base64 and store file
      const fileBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([fileBytes], { type: mimeType });
      const fileId = await ctx.storage.store(blob);
      const size = fileBytes.length;

      // Check if file with same name already exists
      const existing = await ctx.runQuery(api.pluginFramework.getPluginFileByName, {
        pluginName,
        fileName,
      });

      if (existing) {
        // Delete old file from storage
        await ctx.storage.delete(existing.fileId);
        
        // Update file record
        await ctx.runMutation(internal.pluginFramework.updatePluginFile, {
          fileRecordId: existing._id,
          fileId,
          size,
          metadata,
          updatedAt: now,
        });

        return existing._id;
      } else {
        // Create new file record
        return await ctx.runMutation(internal.pluginFramework.createPluginFileRecord, {
          pluginName,
          fileName,
          fileId,
          mimeType,
          size,
          metadata,
          createdAt: now,
          updatedAt: now,
        });
      }
    } catch (error) {
      throw new Error(`Failed to store plugin file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

/**
 * Create plugin file record (internal mutation)
 */
export const createPluginFileRecord = internalMutation({
  args: {
    pluginName: v.string(),
    fileName: v.string(),
    fileId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pluginFiles", args);
  },
});

/**
 * Update plugin file record (internal mutation)
 */
export const updatePluginFile = internalMutation({
  args: {
    fileRecordId: v.id("pluginFiles"),
    fileId: v.id("_storage"),
    size: v.number(),
    metadata: v.optional(v.string()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { fileRecordId, ...updates } = args;
    await ctx.db.patch(fileRecordId, updates);
  },
});

/**
 * Get plugin file by name
 */
export const getPluginFileByName = query({
  args: {
    pluginName: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, fileName } = args;
    
    return await ctx.db
      .query("pluginFiles")
      .withIndex("by_plugin_and_name", (q) => 
        q.eq("pluginName", pluginName).eq("fileName", fileName)
      )
      .first();
  },
});

/**
 * Get all files for a plugin
 */
export const getAllPluginFiles = query({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName } = args;
    
    return await ctx.db
      .query("pluginFiles")
      .withIndex("by_plugin", (q) => q.eq("pluginName", pluginName))
      .collect();
  },
});

/**
 * Get plugin file URL
 */
export const getPluginFileUrl = query({
  args: {
    pluginName: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, fileName } = args;
    
    const file = await ctx.db
      .query("pluginFiles")
      .withIndex("by_plugin_and_name", (q) => 
        q.eq("pluginName", pluginName).eq("fileName", fileName)
      )
      .first();

    if (!file) {
      return null;
    }

    const url = await ctx.storage.getUrl(file.fileId);
    return {
      ...file,
      url,
    };
  },
});

/**
 * Delete a plugin file
 */
export const deletePluginFile = action({
  args: {
    pluginName: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName, fileName } = args;
    
    const file = await ctx.runQuery(api.pluginFramework.getPluginFileByName, {
      pluginName,
      fileName,
    });

    if (file) {
      // Delete from storage
      await ctx.storage.delete(file.fileId);
      
      // Delete file record
      await ctx.runMutation(internal.pluginFramework.deletePluginFileRecord, {
        fileRecordId: file._id,
      });
      
      return true;
    }
    return false;
  },
});

/**
 * Delete plugin file record (internal mutation)
 */
export const deletePluginFileRecord = internalMutation({
  args: {
    fileRecordId: v.id("pluginFiles"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.fileRecordId);
  },
});

/**
 * Clear all files for a plugin
 */
export const clearAllPluginFiles = action({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.pluginName);

    const { pluginName } = args;
    
    const files = await ctx.runQuery(api.pluginFramework.getAllPluginFiles, {
      pluginName,
    });

    for (const file of files) {
      // Delete from storage
      await ctx.storage.delete(file.fileId);
      
      // Delete file record
      await ctx.runMutation(internal.pluginFramework.deletePluginFileRecord, {
        fileRecordId: file._id,
      });
    }

    return { deleted: files.length };
  },
});

// ============================================================================
// USER PROFILE & ROLE-BASED ACCESS API
// ============================================================================

/**
 * Get current user profile data
 */
export const getCurrentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    await checkAuthenticated(ctx);

    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), identity.email))
      .first();

    if (!user) {
      return null;
    }

    // Parse user data
    let userData = {};
    try {
      if (user.usrData) {
        userData = JSON.parse(user.usrData);
      }
    } catch (error) {
      console.error("Failed to parse user data:", error);
    }

    return {
      userId: user._id,
      username: user.username || user.email,
      email: user.email,
      name: user.name,
      image: user.image,
      role: (userData as any).role || 'user',
      permissions: (userData as any).permissions || [],
      plugins: (userData as any).plugins || '',
      isApproved: user.isApproved,
      createdAt: user.createdAt,
      ...userData,
    };
  },
});

/**
 * Get user profile by username
 */
export const getUserProfileByUsername = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await checkAuthenticated(ctx);
    if (args.username && args.username !== caller.username && args.username !== caller.email) await checkAdmin(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", args.username))
      .first();

    if (!user) {
      return null;
    }

    // Parse user data
    let userData = {};
    try {
      if (user.usrData) {
        userData = JSON.parse(user.usrData);
      }
    } catch (error) {
      console.error("Failed to parse user data:", error);
    }

    return {
      userId: user._id,
      username: user.username || user.email,
      email: user.email,
      name: user.name,
      image: user.image,
      role: (userData as any).role || 'user',
      permissions: (userData as any).permissions || [],
      plugins: (userData as any).plugins || '',
      isApproved: user.isApproved,
      createdAt: user.createdAt,
      ...userData,
    };
  },
});

/**
 * Check if user has specific role
 */
export const userHasRole = query({
  args: {
    username: v.optional(v.string()),
    requiredRole: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await checkAuthenticated(ctx);
    if (args.username && args.username !== caller.username && args.username !== caller.email) await checkAdmin(ctx);

    let user;
    
    if (args.username) {
      user = await ctx.db
        .query("users")
        .withIndex("username", (q) => q.eq("username", args.username))
        .first();
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return false;
      }
      
      user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), identity.email))
        .first();
    }

    if (!user || !user.usrData) {
      return false;
    }

    try {
      const userData = JSON.parse(user.usrData);
      const userRole = userData.role || 'user';
      
      // Role hierarchy: admin > moderator > user
      const roleHierarchy: { [key: string]: number } = {
        'admin': 3,
        'moderator': 2,
        'user': 1,
      };
      
      return (roleHierarchy[userRole] || 0) >= (roleHierarchy[args.requiredRole] || 0);
    } catch (error) {
      console.error("Failed to parse user data:", error);
      return false;
    }
  },
});

/**
 * Check if user has specific permission
 */
export const userHasPermission = query({
  args: {
    username: v.optional(v.string()),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await checkAuthenticated(ctx);
    if (args.username && args.username !== caller.username && args.username !== caller.email) await checkAdmin(ctx);

    let user;
    
    if (args.username) {
      user = await ctx.db
        .query("users")
        .withIndex("username", (q) => q.eq("username", args.username))
        .first();
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return false;
      }
      
      user = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), identity.email))
        .first();
    }

    if (!user || !user.usrData) {
      return false;
    }

    try {
      const userData = JSON.parse(user.usrData);
      const userRole = userData.role || 'user';
      const permissions = userData.permissions || [];
      
      // Admins have all permissions
      if (userRole === 'admin') {
        return true;
      }
      
      return permissions.includes(args.permission);
    } catch (error) {
      console.error("Failed to parse user data:", error);
      return false;
    }
  },
});

// ============================================================================
// PLUGIN API ENDPOINT MANAGEMENT
// ============================================================================

/**
 * Register API endpoints for a plugin
 */
export const registerPluginApiEndpoints = mutation({
  args: {
    pluginName: v.string(),
    endpoints: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const { pluginName, endpoints } = args;
    
    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_name", (q) => q.eq("name", pluginName))
      .first();

    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    await ctx.db.patch(plugin._id, {
      apiEndpoints: endpoints,
    });

    return { success: true };
  },
});

/**
 * Get plugin by API endpoint
 */
export const getPluginByEndpoint = query({
  args: {
    pluginAlias: v.string(),
  },
  handler: async (ctx, args) => {
    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_name", (q) => q.eq("name", args.pluginAlias))
      .first();

    return plugin;
  },
});

// ============================================================================
// PLUGIN SHARED DATA API
// ============================================================================

const sharedVisibilityValidator = v.union(
  v.literal("public"),
  v.literal("allowlist"),
  v.literal("private")
);

/**
 * Publish shared data for other plugins
 */
export const publishSharedData = mutation({
  args: {
    ownerPlugin: v.string(),
    channel: v.string(),
    key: v.string(),
    value: v.string(),
    visibility: sharedVisibilityValidator,
    targetPlugin: v.optional(v.string()),
    allowedPlugins: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.ownerPlugin);

    const now = Date.now();

    if (args.visibility === "private" && !args.targetPlugin) {
      throw new Error("targetPlugin is required when visibility is private");
    }

    if (args.visibility === "allowlist" && (!args.allowedPlugins || args.allowedPlugins.length === 0)) {
      throw new Error("allowedPlugins is required when visibility is allowlist");
    }

    const existing = await ctx.db
      .query("pluginSharedData")
      .withIndex("by_owner_and_key", (q) =>
        q.eq("ownerPlugin", args.ownerPlugin).eq("channel", args.channel).eq("key", args.key)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        visibility: args.visibility,
        targetPlugin: args.targetPlugin,
        allowedPlugins: args.allowedPlugins,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pluginSharedData", {
      ownerPlugin: args.ownerPlugin,
      channel: args.channel,
      key: args.key,
      value: args.value,
      visibility: args.visibility,
      targetPlugin: args.targetPlugin,
      allowedPlugins: args.allowedPlugins,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Read shared data visible to a specific plugin on a channel
 */
export const readSharedChannelData = query({
  args: {
    requesterPlugin: v.string(),
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.requesterPlugin);

    const records = await ctx.db
      .query("pluginSharedData")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .collect();

    return records.filter((record) => {
      if (record.ownerPlugin === args.requesterPlugin) return true;
      if (record.visibility === "public") return true;
      if (record.visibility === "private") return record.targetPlugin === args.requesterPlugin;
      if (record.visibility === "allowlist") {
        return (record.allowedPlugins || []).includes(args.requesterPlugin);
      }
      return false;
    });
  },
});

/**
 * Read one shared value by owner/channel/key if visible to requester
 */
export const readSharedDataByKey = query({
  args: {
    requesterPlugin: v.string(),
    ownerPlugin: v.string(),
    channel: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.requesterPlugin);

    const record = await ctx.db
      .query("pluginSharedData")
      .withIndex("by_owner_and_key", (q) =>
        q.eq("ownerPlugin", args.ownerPlugin).eq("channel", args.channel).eq("key", args.key)
      )
      .first();

    if (!record) return null;
    if (record.ownerPlugin === args.requesterPlugin) return record;
    if (record.visibility === "public") return record;
    if (record.visibility === "private" && record.targetPlugin === args.requesterPlugin) return record;
    if (record.visibility === "allowlist" && (record.allowedPlugins || []).includes(args.requesterPlugin)) return record;

    return null;
  },
});

/**
 * Delete a shared key owned by plugin
 */
export const deleteSharedData = mutation({
  args: {
    ownerPlugin: v.string(),
    channel: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await checkPluginAccess(ctx, args.ownerPlugin);

    const record = await ctx.db
      .query("pluginSharedData")
      .withIndex("by_owner_and_key", (q) =>
        q.eq("ownerPlugin", args.ownerPlugin).eq("channel", args.channel).eq("key", args.key)
      )
      .first();

    if (!record) return false;
    await ctx.db.delete(record._id);
    return true;
  },
});

// Import api for use in action handlers
import { api, internal } from "./_generated/api";
