import { checkAuthenticated, checkAdmin } from "./permissions";
import { mutation, action, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import bcrypt from "bcryptjs";

// Upload URL for profile pictures
export const generateUploadUrl = mutation(async (ctx) => {
    await checkAuthenticated(ctx);

  return await ctx.storage.generateUploadUrl();
});

// Action to create user (combines hashing and database insertion)
// Mutation to insert user into Convex Auth tables
export const insertAuthUser = internalMutation({
  args: {
    username: v.string(),
    hashPassword: v.string(),
    usrData: v.string(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    if (!username || username.length > 100) throw new Error("Invalid username");
    const existing = await ctx.db.query("users").withIndex("username", q => q.eq("username", username)).first();
    const existingAccount = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", username)).first();
    if (existing || existingAccount) throw new Error("Username already exists");
    JSON.parse(args.usrData);
    // Create user in Convex Auth users table
    const userId = await ctx.db.insert("users", {
      email: username, // Store username in email field
      name: username,
      username: username,
      usrData: args.usrData,
      isApproved: true,
      createdAt: Date.now(),
      // Don't explicitly set undefined fields - let Convex handle optional fields
    });

    // Create an account in authAccounts table with the hashed password
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: username,
      secret: args.hashPassword,
    });

    return userId;
  },
});

export const createUserAction: any = action({
  args: {
    username: v.string(),
    password: v.string(),
    usrData: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const { password, usrData } = args;
    const username = args.username.trim().toLowerCase();
    if (password.length < 8) throw new Error("Password must have at least 8 characters");

    // Check if user already exists
    const existingUser = await ctx.runQuery(api.context.getUserByUsername, { username });
    if (existingUser) {
      throw new Error("User already exists");
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into database
    const userId = await ctx.runMutation(internal.context.insertAuthUser, {
      username,
      hashPassword: hashedPassword,
      usrData,
    });

    return userId;
  },
});

// Query to get user by username
// Query to get user by username (from new users table)
export const getUserByUsername = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    return await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", args.username))
      .first();
  },
});

// Query to get all users (for admin) — resolves image storage IDs to real URLs
export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await checkAdmin(ctx);

    const users = await ctx.db.query("users").collect();
    return await Promise.all(
      users.map(async (user) => {
        let imageUrl: string | null = null;
        if (user.image) {
          if ((user.image as string).startsWith("http")) {
            imageUrl = user.image as string;
          } else {
            try {
              imageUrl = await ctx.storage.getUrl(user.image as any);
            } catch {
              imageUrl = null;
            }
          }
        }
        return { ...user, imageUrl };
      })
    );
  },
});

// Action to delete user (for admin)
export const deleteUserAction = action({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    await ctx.runMutation(internal.context.deleteUser, { userId: args.userId });
  },
});

// NUCLEAR: Clear ALL authentication data
export const clearAllAuthDataAction = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("🚨 CLEARING ALL AUTHENTICATION DATA");
    return await ctx.runMutation(internal.context.clearAllAuthData);
  },
});

// NUCLEAR: Clear ALL authentication data (internal mutation)
export const clearAllAuthData = internalMutation({
  args: {},
  handler: async (ctx) => {
    let usersDeleted = 0;
    let accountsDeleted = 0;
    let sessionsDeleted = 0;

    try {
      // Delete all users
      const allUsers = await ctx.db.query("users").collect();
      for (const user of allUsers) {
        await ctx.db.delete(user._id);
        usersDeleted++;
      }
      console.log(`✓ Deleted ${usersDeleted} users`);
    } catch (e) {
      console.error("Error deleting users:", e);
    }

    try {
      // Delete all auth accounts
      const allAccounts = await ctx.db.query("authAccounts").collect();
      for (const account of allAccounts) {
        await ctx.db.delete(account._id);
        accountsDeleted++;
      }
      console.log(`✓ Deleted ${accountsDeleted} auth accounts`);
    } catch (e) {
      console.error("Error deleting accounts:", e);
    }

    try {
      // Delete all sessions
      const allSessions = await ctx.db.query("authSessions").collect();
      for (const session of allSessions) {
        await ctx.db.delete(session._id);
        sessionsDeleted++;
      }
      console.log(`✓ Deleted ${sessionsDeleted} sessions`);
    } catch (e) {
      console.error("Error deleting sessions:", e);
    }

    return {
      usersDeleted,
      accountsDeleted,
      sessionsDeleted,
    };
  },
});

// NUCLEAR: Clear ALL application + authentication data
export const clearAllDataAction = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("🚨 CLEARING ALL DATABASE DATA");
    return await ctx.runMutation(internal.context.clearAllData);
  },
});

// NUCLEAR: Clear ALL application + authentication data (internal mutation)
export const clearAllData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tableOrder = [
      "authSessions",
      "authAccounts",
      "apiKeys",
      "car_history",
      "current_cars",
      "spaces",
      "plugins",
      "usrs",
      "users",
      "_storage",
    ];

    const deleted: Record<string, number> = {};

    for (const tableName of tableOrder) {
      try {
        const rows = await (ctx.db as any).query(tableName).collect();
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
        deleted[tableName] = rows.length;
      } catch (error) {
        console.error(`Error clearing ${tableName}:`, error);
        deleted[tableName] = -1;
      }
    }

    return {
      message: "All database tables cleared",
      deleted,
    };
  },
});

// Mutation to delete user (for admin)
// Mutation to delete user (for admin)
export const deleteUser = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.userId);
    // Note: We should also delete authTables data, but this is a start.
    // The admin dashboard uses this to delete users.

    // Attempt to find and delete authAccounts for this user
    try {
      const authAccount = await ctx.db.query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
        .first();
      if (authAccount) {
        await ctx.db.delete(authAccount._id);
      }
    } catch (e) {
      // ignore errors here if index check fails
    }
  },
});

// Action to update user (for admin)
// Action to update user (for admin)
export const updateUserAction = action({
  args: {
    userId: v.string(), // ID string
    username: v.optional(v.string()),
    password: v.optional(v.string()),
    image: v.optional(v.string()),
    usrData: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const { userId, username, password, image, usrData } = args;

    const updateData: any = { usrData };

    if (username) {
      updateData.username = username;
      updateData.email = username; // Sync email
      updateData.name = username; // Sync name
    }

    if (image !== undefined) {
      updateData.image = image;
    }

    let hashedPassword;
    if (password) {
      if (password.length < 8) throw new Error("Password must have at least 8 characters");
      hashedPassword = await bcrypt.hash(password, 10);
    }

    await ctx.runMutation(internal.context.updateUser, {
      userId,
      ...updateData,
      newHashPassword: hashedPassword
    });
  },
});

// Mutation to update user (for admin)
// Mutation to update user (for admin)
export const updateUser = internalMutation({
  args: {
    userId: v.string(), // string for flexibility
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    newHashPassword: v.optional(v.string()), // Passed if password changed
    image: v.optional(v.string()),
    usrData: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, newHashPassword, ...updateData } = args;
    const id = ctx.db.normalizeId("users", userId);
    if (!id) throw new Error("User not found");
    const user = await ctx.db.get(id);
    if (!user) throw new Error("User not found");
    if (updateData.username) {
      const username = updateData.username.trim().toLowerCase();
      if (!username || username.length > 100) throw new Error("Invalid username");
      const duplicate = await ctx.db.query("users").withIndex("username", q => q.eq("username", username)).first();
      const collision = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", username)).first();
      if ((duplicate && duplicate._id !== id) || (collision && collision.userId !== id)) throw new Error("Username already exists");
      updateData.username = username; updateData.email = username; updateData.name = username;
      const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", id).eq("provider", "password")).collect();
      for (const account of accounts) await ctx.db.patch(account._id, { providerAccountId: username });
    }
    JSON.parse(updateData.usrData);

    // Update user record
    await ctx.db.patch(userId as any, updateData);

    // Update password if provided
    if (newHashPassword) {
      // Find authAccount
      const authAccount = await ctx.db.query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId as any))
        .first();

      if (authAccount) {
        await ctx.db.patch(authAccount._id, { secret: newHashPassword });
      }
    }
  },
});

// Plugin upload mutations and actions
export const uploadPluginAction: any = action({
  args: {
    pluginName: v.string(),
    author: v.string(),
    version: v.string(),
    description: v.optional(v.string()),
    manifestFile: v.optional(v.string()), // base64 encoded
    coreFile: v.optional(v.string()), // base64 encoded
    iconFile: v.optional(v.string()), // base64 encoded (legacy)
    iconLightFile: v.optional(v.string()), // base64 encoded
    iconDarkFile: v.optional(v.string()), // base64 encoded
    assets: v.optional(v.array(v.object({
      name: v.string(),
      content: v.string(), // base64 encoded
      mimeType: v.optional(v.string())
    }))),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const {
      pluginName, author, version, description,
      manifestFile, coreFile, iconFile,
      iconLightFile, iconDarkFile, assets
    } = args;

    // Validate file formats for uploaded files
    if (manifestFile) {
      const manifestValid = validateManifestFile(manifestFile);
      if (!manifestValid) {
        throw new Error("Invalid manifest file format. Must be valid JSON.");
      }
    }

    if (coreFile) {
      const coreValid = validateCoreFile(coreFile);
      if (!coreValid) {
        throw new Error("Invalid core file format. Must be valid JavaScript.");
      }
    }

    if (iconFile) {
      const iconValid = validateIconFile(iconFile);
      if (!iconValid) {
        throw new Error("Invalid icon file format. Must be valid SVG.");
      }
    }

    if (iconLightFile) {
      const iconValid = validateIconFile(iconLightFile);
      if (!iconValid) {
        throw new Error("Invalid light icon file format. Must be valid SVG.");
      }
    }

    if (iconDarkFile) {
      const iconValid = validateIconFile(iconDarkFile);
      if (!iconValid) {
        throw new Error("Invalid dark icon file format. Must be valid SVG.");
      }
    }

    // Check if plugin already exists
    const existingPlugin = await ctx.runQuery(api.context.getPluginByName, { name: pluginName });

    // Parse manifest to extract apiEndpoints
    let apiEndpoints: string[] = [];
    if (manifestFile) {
      try {
        const manifestContent = atob(manifestFile);
        const manifest = JSON.parse(manifestContent);
        apiEndpoints = manifest.apiEndpoints || [];
      } catch (error) {
        console.error('Failed to parse manifest for apiEndpoints:', error);
      }
    } else if (existingPlugin) {
      // Preserve existing endpoints if manifest not updated
      apiEndpoints = existingPlugin.apiEndpoints || [];
    }

    // Upload files to storage (only for files that were provided)
    let manifestFileId: any;
    let coreFileId: any;
    let iconFileId: any;
    let iconLightFileId: any;
    let iconDarkFileId: any;

    try {
      if (manifestFile) {
        const manifestBytes = Uint8Array.from(atob(manifestFile), c => c.charCodeAt(0));
        manifestFileId = await ctx.storage.store(
          new Blob([manifestBytes], { type: 'application/json' })
        );
      }

      if (coreFile) {
        const coreBytes = Uint8Array.from(atob(coreFile), c => c.charCodeAt(0));
        coreFileId = await ctx.storage.store(
          new Blob([coreBytes], { type: 'application/javascript' })
        );
      }

      if (iconFile) {
        const iconBytes = Uint8Array.from(atob(iconFile), c => c.charCodeAt(0));
        iconFileId = await ctx.storage.store(
          new Blob([iconBytes], { type: 'image/svg+xml' })
        );
      }

      if (iconLightFile) {
        const iconBytes = Uint8Array.from(atob(iconLightFile), c => c.charCodeAt(0));
        iconLightFileId = await ctx.storage.store(
          new Blob([iconBytes], { type: 'image/svg+xml' })
        );
      }

      if (iconDarkFile) {
        const iconBytes = Uint8Array.from(atob(iconDarkFile), c => c.charCodeAt(0));
        iconDarkFileId = await ctx.storage.store(
          new Blob([iconBytes], { type: 'image/svg+xml' })
        );
      }
    } catch (storageError) {
      throw new Error(`File storage failed: ${storageError instanceof Error ? storageError.message : 'Unknown error'}`);
    }

    // Create or update plugin record
    if (existingPlugin) {
      // Update existing plugin - only update files that were provided
      const updateData: any = {
        pluginId: existingPlugin._id,
        author,
        version,
        description,
        uploadDate: Date.now(),
        apiEndpoints,
      };

      // Only update file IDs for files that were uploaded
      if (manifestFile) {
        // Delete old manifest file
        await ctx.storage.delete(existingPlugin.manifestFileId);
        updateData.manifestFileId = manifestFileId;
      }

      if (coreFile) {
        // Delete old core file
        await ctx.storage.delete(existingPlugin.coreFileId);
        updateData.coreFileId = coreFileId;
      }

      if (iconFile) {
        // Delete old icon file if it exists
        if (existingPlugin.iconFileId) {
          await ctx.storage.delete(existingPlugin.iconFileId);
        }
        updateData.iconFileId = iconFileId;
      }

      if (iconLightFile) {
        if (existingPlugin.iconLightFileId) {
          await ctx.storage.delete(existingPlugin.iconLightFileId);
        }
        updateData.iconLightFileId = iconLightFileId;
      }

      if (iconDarkFile) {
        if (existingPlugin.iconDarkFileId) {
          await ctx.storage.delete(existingPlugin.iconDarkFileId);
        }
        updateData.iconDarkFileId = iconDarkFileId;
      }

      await ctx.runMutation(internal.context.updatePlugin, updateData);
    } else {
      // Create new plugin - require manifest and core files
      if (!manifestFile || !coreFile) {
        throw new Error("Manifest and core files are required for new plugins.");
      }

      await ctx.runMutation(internal.context.createPlugin, {
        name: pluginName,
        author,
        version,
        description,
        manifestFileId,
        coreFileId,
        iconFileId,
        iconLightFileId,
        iconDarkFileId,
        uploadDate: Date.now(),
        isActive: true,
        apiEndpoints,
      });
    }

    // Handle Assets
    if (assets !== undefined) {
      // Treat the incoming asset list as the source of truth for updates.
      if (existingPlugin) {
        const oldAssets = await ctx.runQuery(internal.context.getPluginAssets, { pluginName });
        for (const asset of oldAssets) {
          await ctx.storage.delete(asset.fileId);
          await ctx.runMutation(internal.context.deletePluginFile, { fileId: asset._id });
        }
      }

      // Upload new assets, if any were provided.
      for (const asset of assets) {
        try {
          const assetBytes = Uint8Array.from(atob(asset.content), c => c.charCodeAt(0));
          const mimeType = asset.mimeType || 'application/octet-stream';
          const fileId = await ctx.storage.store(
            new Blob([assetBytes], { type: mimeType })
          );

          await ctx.runMutation(internal.context.createPluginFile, {
            pluginName,
            fileName: asset.name,
            fileId,
            mimeType,
            size: assetBytes.length,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } catch (err) {
          console.error(`Failed to upload asset ${asset.name}:`, err);
        }
      }
    }

    return { success: true, message: existingPlugin ? 'Plugin updated successfully' : 'Plugin created successfully' };
  },
});

export const createPlugin = internalMutation({
  args: {
    name: v.string(),
    author: v.string(),
    version: v.string(),
    description: v.optional(v.string()),
    manifestFileId: v.id("_storage"),
    coreFileId: v.id("_storage"),
    iconFileId: v.optional(v.id("_storage")),
    iconLightFileId: v.optional(v.id("_storage")),
    iconDarkFileId: v.optional(v.id("_storage")),
    uploadDate: v.number(),
    isActive: v.boolean(),
    apiEndpoints: v.optional(v.array(v.string())),
    _syncToken: v.optional(v.string()), // Dummy field to force sync if needed
  },
  handler: async (ctx, args) => {
    const { _syncToken, ...data } = args;
    return await ctx.db.insert("plugins", data as any);
  },
});

export const getPluginByName = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    return await ctx.db
      .query("plugins")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const getAllPlugins = query({
  args: {},
  handler: async (ctx) => {
    await checkAuthenticated(ctx);

    return await ctx.db.query("plugins").collect();
  },
});

// Query to get plugins by names (for user's plugin list)
export const getPluginsByNames = query({
  args: {
    pluginNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    const plugins = [];
    for (const name of args.pluginNames) {
      const plugin = await ctx.db
        .query("plugins")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (plugin) {
        plugins.push(plugin);
      }
    }
    return plugins;
  },
});

// Query to get plugin files (manifest, core, icon)
export const getPluginFiles = query({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_name", (q) => q.eq("name", args.pluginName))
      .first();

    if (!plugin) {
      return null;
    }

    // Get file URLs from storage
    const manifestUrl = await ctx.storage.getUrl(plugin.manifestFileId);
    const coreUrl = await ctx.storage.getUrl(plugin.coreFileId);
    const iconUrl = plugin.iconFileId ? await ctx.storage.getUrl(plugin.iconFileId) : null;
    const iconLightUrl = plugin.iconLightFileId ? await ctx.storage.getUrl(plugin.iconLightFileId) : null;
    const iconDarkUrl = plugin.iconDarkFileId ? await ctx.storage.getUrl(plugin.iconDarkFileId) : null;

    return {
      plugin,
      files: {
        manifestUrl,
        coreUrl,
        iconUrl,
        iconLightUrl,
        iconDarkUrl,
      }
    };
  },
});

// Helper function to clean up plugin references from all users
export const cleanupPluginFromAllUsers = action({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const allUsers = await ctx.runQuery(api.context.getAllUsers);
    let usersUpdated = 0;

    for (const user of allUsers) {
      try {
        const usrData = JSON.parse(user.usrData);
        const currentPlugins = usrData.plugins ? usrData.plugins.split(',').map((p: string) => p.trim()).filter(Boolean) : [];

        // Remove plugin from list if it exists
        const updatedPlugins = currentPlugins.filter((p: string) => p !== args.pluginName);

        // Only update if the plugin was actually in the user's list
        if (updatedPlugins.length !== currentPlugins.length) {
          usrData.plugins = updatedPlugins.join(',');
          await ctx.runMutation(internal.context.updateUser, {
            userId: user._id as string,
            usrData: JSON.stringify(usrData)
          });
          usersUpdated++;
        }
      } catch (error) {
        console.error(`Failed to update user ${user._id} during plugin cleanup:`, error);
        // Continue with other users even if one fails
      }
    }

    return { usersUpdated };
  },
});

// Action to delete a plugin
export const deletePluginAction: any = action({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const plugin = await ctx.runQuery(api.context.getPluginByName, { name: args.pluginName });

    if (!plugin) {
      throw new Error("Plugin not found");
    }

    // Clean up plugin references from all users
    let cleanupResult;
    try {
      cleanupResult = await ctx.runAction(api.context.cleanupPluginFromAllUsers, {
        pluginName: args.pluginName
      });
    } catch (error) {
      console.error('Failed to cleanup plugin from users:', error);
      cleanupResult = { usersUpdated: 0 };
    }

    const usersUpdated = cleanupResult?.usersUpdated || 0;
    console.log(`Plugin "${args.pluginName}" removed from ${usersUpdated} users`);

    // Delete files from storage
    await ctx.storage.delete(plugin.manifestFileId);
    await ctx.storage.delete(plugin.coreFileId);
    if (plugin.iconFileId) {
      await ctx.storage.delete(plugin.iconFileId);
    }
    if (plugin.iconLightFileId) {
      await ctx.storage.delete(plugin.iconLightFileId);
    }
    if (plugin.iconDarkFileId) {
      await ctx.storage.delete(plugin.iconDarkFileId);
    }

    const pluginAssets = await ctx.runQuery(internal.context.getPluginAssets, { pluginName: args.pluginName });
    for (const asset of pluginAssets) {
      await ctx.storage.delete(asset.fileId);
      await ctx.runMutation(internal.context.deletePluginFile, { fileId: asset._id });
    }

    // Delete plugin record from database
    await ctx.runMutation(api.context.deletePlugin, { pluginId: plugin._id });

    return {
      success: true,
      usersUpdated: usersUpdated,
      message: `Plugin "${args.pluginName}" deleted successfully and removed from ${usersUpdated} users`
    };
  },
});

// Mutation to update plugin in database
export const updatePlugin = internalMutation({
  args: {
    pluginId: v.id("plugins"),
    author: v.string(),
    version: v.string(),
    description: v.optional(v.string()),
    manifestFileId: v.optional(v.id("_storage")),
    coreFileId: v.optional(v.id("_storage")),
    iconFileId: v.optional(v.id("_storage")),
    iconLightFileId: v.optional(v.id("_storage")),
    iconDarkFileId: v.optional(v.id("_storage")),
    uploadDate: v.number(),
    apiEndpoints: v.optional(v.array(v.string())),
    _syncToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { pluginId, _syncToken, ...updateData } = args;
    await ctx.db.patch(pluginId, updateData);
  },
});

// Mutation to delete plugin from database
export const deletePlugin = mutation({
  args: {
    pluginId: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    await ctx.db.delete(args.pluginId);
  },
});

// Action to add plugin to user's plugin list
export const addPluginToUserAction = action({
  args: {
    userId: v.string(),
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const user = await ctx.runQuery(api.context.getUserById, { userId: args.userId });
    if (!user) {
      throw new Error("User not found");
    }

    const usrData = JSON.parse(user.usrData);
    const currentPlugins = usrData.plugins ? usrData.plugins.split(',').map((p: string) => p.trim()).filter(Boolean) : [];

    // Add plugin if not already present
    if (!currentPlugins.includes(args.pluginName)) {
      currentPlugins.push(args.pluginName);
      usrData.plugins = currentPlugins.join(',');

      await ctx.runMutation(internal.context.updateUser, {
        userId: args.userId,
        usrData: JSON.stringify(usrData)
      });
    }

    return { success: true };
  },
});

// Action to remove plugin from user's plugin list
export const removePluginFromUserAction = action({
  args: {
    userId: v.string(),
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const user = await ctx.runQuery(api.context.getUserById, { userId: args.userId });
    if (!user) {
      throw new Error("User not found");
    }

    const usrData = JSON.parse(user.usrData);
    const currentPlugins = usrData.plugins ? usrData.plugins.split(',').map((p: string) => p.trim()).filter(Boolean) : [];

    // Remove plugin from list
    const updatedPlugins = currentPlugins.filter((p: string) => p !== args.pluginName);
    usrData.plugins = updatedPlugins.join(',');

    await ctx.runMutation(internal.context.updateUser, {
      userId: args.userId,
      usrData: JSON.stringify(usrData)
    });

    return { success: true };
  },
});

// Query to get user by ID
export const getUserById = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    return await ctx.db.get(args.userId as any);
  },
});

// Query to get plugin icon URL
export const getPluginIconUrl = query({
  args: {
    pluginName: v.string(),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_name", (q) => q.eq("name", args.pluginName))
      .first();

    if (!plugin) return null;

    // Try to get theme-specific icon first
    if (args.theme === 'light' && plugin.iconLightFileId) {
      return await ctx.storage.getUrl(plugin.iconLightFileId);
    }
    if (args.theme === 'dark' && plugin.iconDarkFileId) {
      return await ctx.storage.getUrl(plugin.iconDarkFileId);
    }

    // Fallback to legacy icon or any available theme icon
    const iconId = plugin.iconFileId || plugin.iconLightFileId || plugin.iconDarkFileId;
    if (!iconId) return null;

    return await ctx.storage.getUrl(iconId);
  },
});

// File validation functions
function validateManifestFile(base64Content: string): boolean {
  try {
    console.log("=== MANIFEST VALIDATION START ===");
    console.log("Base64 length:", base64Content.length);
    console.log("Base64 preview:", base64Content.substring(0, 100));

    // Try to decode base64 using atob (browser/Convex compatible)
    let content: string;
    try {
      content = atob(base64Content);
      console.log("Successfully decoded base64");
      console.log("Decoded content preview:", content.substring(0, 200));
    } catch (decodeError) {
      console.log("Base64 decode error:", decodeError);
      return false;
    }

    // Try to parse JSON
    let manifest: any;
    try {
      manifest = JSON.parse(content);
      console.log("Successfully parsed JSON");
      console.log("Manifest keys:", Object.keys(manifest));
    } catch (parseError) {
      console.log("JSON parse error:", parseError);
      console.log("Content that failed to parse:", content);
      return false;
    }

    // Validate required fields
    const hasName = typeof manifest.name === 'string';
    const hasVersion = typeof manifest.version === 'string';
    const hasAuthor = typeof manifest.author === 'string';

    console.log("Field validation:", { hasName, hasVersion, hasAuthor });
    console.log("Field values:", {
      name: manifest.name,
      version: manifest.version,
      author: manifest.author
    });

    const isValid = hasName && hasVersion && hasAuthor;
    console.log("Final validation result:", isValid);
    console.log("=== MANIFEST VALIDATION END ===");

    return isValid;
  } catch (error) {
    console.log("Unexpected error in manifest validation:", error);
    return false;
  }
}

function validateCoreFile(base64Content: string): boolean {
  try {
    const content = atob(base64Content);

    // Basic JavaScript validation - check for common syntax
    return content.includes('function') ||
      content.includes('const') ||
      content.includes('let') ||
      content.includes('var') ||
      content.includes('class') ||
      content.includes('export');
  } catch {
    return false;
  }
}

function validateIconFile(base64Content: string): boolean {
  try {
    const content = atob(base64Content);

    // Basic SVG validation
    return content.includes('<svg') && content.includes('</svg>');
  } catch {
    return false;
  }
}

// Spaces table queries and mutations
export const getAllSpaces = query({
  args: {},
  handler: async (ctx) => {
    await checkAuthenticated(ctx);

    return await ctx.db.query("spaces").collect();
  },
});

export const getSpaceByName = query({
  args: {
    spaceName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    return await ctx.db
      .query("spaces")
      .withIndex("by_spaceName", (q) => q.eq("spaceName", args.spaceName))
      .first();
  },
});

export const updateSpaceStatus = mutation({
  args: {
    spaceName: v.string(),
    isFull: v.boolean(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const existingSpace = await ctx.db
      .query("spaces")
      .withIndex("by_spaceName", (q) => q.eq("spaceName", args.spaceName))
      .first();

    if (existingSpace) {
      await ctx.db.patch(existingSpace._id, { isFull: args.isFull });
      return existingSpace._id;
    } else {
      return await ctx.db.insert("spaces", args);
    }
  },
});

export const createSpace = mutation({
  args: {
    spaceName: v.string(),
    isFull: v.boolean(),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    return await ctx.db.insert("spaces", args);
  },
});

// DEBUG: Get account by ID
export const debugGetAccountById = internalQuery({
  args: {
    accountId: v.id("authAccounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  }
});

// ============================================
// ACCOUNT APPROVAL SYSTEM
// ============================================

/**
 * Get all pending accounts waiting for approval
 */
export const getPendingAccounts = query({
  args: {},
  handler: async (ctx) => {
    await checkAdmin(ctx);

    const pending = await ctx.db
      .query("users")
      .withIndex("isApproved", (q) => q.eq("isApproved", false))
      .collect();

    return pending.map((user) => ({
      _id: user._id,
      username: user.username || user.email,
      email: user.email,
      createdAt: user.createdAt || 0,
      isApproved: user.isApproved,
      name: user.name,
    }));
  },
});

/**
 * Approve a pending account (admin only)
 */
export const approveAccount = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      isApproved: true,
    });

    return { success: true, message: `Účet ${user.username || user.email} byl schválen` };
  },
});

/**
 * Reject a pending account (admin only)
 */
export const rejectAccount = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await checkAdmin(ctx);

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Delete the user
    await ctx.db.delete(args.userId);

    // Delete associated auth account
    const authAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId).eq("provider", "password"))
      .first();

    if (authAccount) {
      await ctx.db.delete(authAccount._id);
    }

    return { success: true, message: `Účet byl zamítnut a smazán` };
  },
});

/**
 * Get file URL from file ID
 */
export const getFileUrl = query({
  args: {
    fileId: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    try {
      const url = await ctx.storage.getUrl(args.fileId);
      return url;
    } catch (error) {
      console.error(`Failed to get file URL for ${args.fileId}:`, error);
      return null;
    }
  },
});

/**
 * Remove non-existent plugins from user's plugin list
 */
export const removeNonExistentPlugins = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await checkAuthenticated(ctx); if (caller._id !== args.userId) await checkAdmin(ctx);

    try {
      const user = await ctx.db.get(args.userId as any) as any;
      if (!user || !user.usrData) {
        return { success: false, error: 'User not found or has no data' };
      }

      // Parse user data
      const usrData = JSON.parse(user.usrData);
      const currentPlugins = usrData.plugins ? usrData.plugins.split(',').map((p: string) => p.trim()).filter(Boolean) : [];

      if (currentPlugins.length === 0) {
        return { success: true, removed: 0 };
      }

      // Get all available plugins
      const allPlugins = await ctx.db.query("plugins").collect();
      const availablePluginNames = new Set(allPlugins.map((p: any) => p.name));

      // Filter out non-existent plugins
      const validPlugins = currentPlugins.filter((pluginName: string) => availablePluginNames.has(pluginName));
      const removed = currentPlugins.length - validPlugins.length;

      if (removed > 0) {
        // Update user's plugin list
        usrData.plugins = validPlugins.join(',');
        await ctx.db.patch(args.userId as any, {
          usrData: JSON.stringify(usrData)
        });
      console.log(`Removed ${removed} non-existent plugins from user ${args.userId}`);
    }

    return { success: true, removed, remainingPlugins: validPlugins };
  } catch (error) {
    console.error(`Failed to remove non-existent plugins:`, error);
    return { success: false, error: String(error) };
    }
  },
});

// Plugin File/Asset Management Helpers
export const createPluginFile = internalMutation({
  args: {
    pluginName: v.string(),
    fileName: v.string(),
    fileId: v.id("_storage"),
    mimeType: v.string(),
    size: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pluginFiles", args);
  },
});

export const deletePluginFile = internalMutation({
  args: { fileId: v.id("pluginFiles") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.fileId);
  },
});

export const getPluginAssets = internalQuery({
  args: { pluginName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pluginFiles")
      .withIndex("by_plugin", (q) => q.eq("pluginName", args.pluginName))
      .collect();
  },
});

/**
 * Public query to get a specific asset URL for a plugin
 */
export const getPluginAssetUrl = query({
  args: {
    pluginName: v.string(),
    assetName: v.string(),
  },
  handler: async (ctx, args) => {
    await checkAuthenticated(ctx);

    const file = await ctx.db
      .query("pluginFiles")
      .withIndex("by_plugin_and_name", (q) =>
        q.eq("pluginName", args.pluginName).eq("fileName", args.assetName)
      )
      .first();

    if (!file) return null;
    return await ctx.storage.getUrl(file.fileId);
  },
});
