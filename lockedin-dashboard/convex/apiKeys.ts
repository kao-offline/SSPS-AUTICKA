import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { checkAdmin } from "./permissions";

function generateSecureKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "lk_"; // prefix "lockedin_key"
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generate a new API Key - ADMIN ONLY
 */
export const generateKey = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        scopes: v.array(v.string()),
        allowedPlugins: v.optional(v.array(v.string())),
        dataScopes: v.optional(v.array(v.string())),
        allowedEndpoints: v.optional(v.array(v.string())),
        blockedEndpoints: v.optional(v.array(v.string())),
        rateLimit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // 1. Authenticate Admin
        const user = await checkAdmin(ctx);

        // 2. Generate Key
        const newKey = generateSecureKey();

        // 3. Store in DB
        await ctx.db.insert("apiKeys", {
            key: newKey,
            name: args.name,
            description: args.description,
            createdBy: user._id,
            createdAt: Date.now(),
            isActive: true,
            scopes: args.scopes,
            allowedPlugins: args.allowedPlugins,
            dataScopes: args.dataScopes,
            allowedEndpoints: args.allowedEndpoints,
            blockedEndpoints: args.blockedEndpoints,
            rateLimit: args.rateLimit || 0,
            requestCount: 0,
            rateLimitWindow: Date.now(),
        });

        // 4. Return to user (only time it will be seen)
        return newKey;
    },
});

/**
 * List all API Keys - ADMIN ONLY
 */
export const listKeys = query({
    args: {},
    handler: async (ctx) => {
        await checkAdmin(ctx);
        return await ctx.db.query("apiKeys").collect();
    },
});

/**
 * Revoke an API Key - ADMIN ONLY
 */
export const revokeKey = mutation({
    args: {
        id: v.id("apiKeys"),
    },
    handler: async (ctx, args) => {
        await checkAdmin(ctx);
        await ctx.db.patch(args.id, { isActive: false });
    },
});

/**
 * Permanently delete an API Key - ADMIN ONLY
 * Safety: active keys must be revoked first.
 */
export const deleteKey = mutation({
    args: {
        id: v.id("apiKeys"),
    },
    handler: async (ctx, args) => {
        await checkAdmin(ctx);

        const key = await ctx.db.get(args.id);
        if (!key) {
            throw new Error("API key not found");
        }

        if (key.isActive) {
            throw new Error("Active keys cannot be deleted. Revoke the key first.");
        }

        await ctx.db.delete(args.id);
        return { success: true };
    },
});

/**
 * Update an API Key settings - ADMIN ONLY
 */
export const updateKey = mutation({
    args: {
        id: v.id("apiKeys"),
        name: v.string(),
        description: v.optional(v.string()),
        scopes: v.array(v.string()),
        allowedPlugins: v.optional(v.array(v.string())),
        dataScopes: v.optional(v.array(v.string())),
        allowedEndpoints: v.optional(v.array(v.string())),
        blockedEndpoints: v.optional(v.array(v.string())),
        rateLimit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await checkAdmin(ctx);

        const { id, ...updateData } = args;

        await ctx.db.patch(id, {
            name: updateData.name,
            description: updateData.description,
            scopes: updateData.scopes,
            allowedPlugins: updateData.allowedPlugins,
            dataScopes: updateData.dataScopes,
            allowedEndpoints: updateData.allowedEndpoints,
            blockedEndpoints: updateData.blockedEndpoints,
            rateLimit: updateData.rateLimit || 0,
        });
    },
});

/**
 * Check if an API key can access a specific endpoint
 */
export function canKeyAccessEndpoint(
    keyRecord: any,
    endpoint: string,
    requiredScopes: string[] = []
): boolean {
    // Check if key is active
    if (!keyRecord || !keyRecord.isActive) {
        return false;
    }

    // Check if all required scopes are present
    for (const scope of requiredScopes) {
        if (!keyRecord.scopes.includes(scope)) {
            return false;
        }
    }

    // Check if endpoint is blocked
    const normalize = (path: string) => path.trim().replace(/^\/?api\//, '').replace(/^\//, '');
    const path = normalize(endpoint);
    if (keyRecord.blockedEndpoints?.some((entry: string) => normalize(entry) === path)) {
        return false;
    }

    // Check if endpoints are restricted and endpoint is not in allowlist
    if (keyRecord.allowedEndpoints && keyRecord.allowedEndpoints.length > 0) {
        if (!keyRecord.allowedEndpoints.some((entry: string) => normalize(entry) === path)) {
            return false;
        }
    }

    return true;
}

/**
 * Validate an API key internally.
 * Returns { valid: boolean, reason?: string, scopes?: string[] }
 * Updates lastUsed timestamp if valid.
 */
export async function validateKey(ctx: any, apiKey: string) {
    const keyRecord = await ctx.db
        .query("apiKeys")
        .withIndex("by_key", (q: any) => q.eq("key", apiKey))
        .first();

    if (!keyRecord || !keyRecord.isActive) {
        return { valid: false, reason: "Invalid or revoked API key" };
    }

    // Check rate limiting
    if (keyRecord.rateLimit && keyRecord.rateLimit > 0) {
        const now = Date.now();
        const windowStart = keyRecord.rateLimitWindow || 0;
        const windowDuration = 60 * 1000; // 1 minute

        if (now - windowStart < windowDuration) {
            // Still in current window
            if ((keyRecord.requestCount || 0) >= keyRecord.rateLimit) {
                return { valid: false, reason: "Rate limit exceeded" };
            }
        } else {
            // New window
            await ctx.db.patch(keyRecord._id, {
                rateLimitWindow: now,
                requestCount: 0,
            });
        }
    }

    // Increment request count if rate limiting is enabled
    if (keyRecord.rateLimit && keyRecord.rateLimit > 0) {
        const newWindow = !keyRecord.rateLimitWindow || Date.now() - keyRecord.rateLimitWindow >= 60000;
        await ctx.db.patch(keyRecord._id, {
            rateLimitWindow: newWindow ? Date.now() : keyRecord.rateLimitWindow,
            requestCount: newWindow ? 1 : (keyRecord.requestCount || 0) + 1,
            lastUsed: Date.now(),
        });
    } else {
        // Just update lastUsed
        await ctx.db.patch(keyRecord._id, { lastUsed: Date.now() });
    }

    return {
        valid: true,
        scopes: keyRecord.scopes,
        allowedPlugins: keyRecord.allowedPlugins,
        allowedEndpoints: keyRecord.allowedEndpoints,
        blockedEndpoints: keyRecord.blockedEndpoints,
    };
}
