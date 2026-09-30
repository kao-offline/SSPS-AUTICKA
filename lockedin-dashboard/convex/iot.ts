import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateKey } from "./apiKeys";

/**
 * Update space status from IoT device.
 * Requires valid API Key.
 */
export const updateSpaceStatus = mutation({
    args: {
        apiKey: v.string(),
        spaceName: v.string(),
        isFull: v.boolean(),
    },
    handler: async (ctx, args) => {
        const isValid = await validateKey(ctx, args.apiKey);
        if (!isValid.valid || !isValid.scopes?.includes('data:write')) {
            throw new Error("Invalid or inactive API Key");
        }

        const existingSpace = await ctx.db
            .query("spaces")
            .withIndex("by_spaceName", (q) => q.eq("spaceName", args.spaceName))
            .first();

        if (existingSpace) {
            await ctx.db.patch(existingSpace._id, { isFull: args.isFull });
        } else {
            await ctx.db.insert("spaces", {
                spaceName: args.spaceName,
                isFull: args.isFull,
            });
        }

        return { success: true };
    },
});

/**
 * Log car entry/exit from IoT device.
 * Requires valid API Key.
 */
export const logCarEntry = mutation({
    args: {
        apiKey: v.string(),
        licensePlate: v.string(),
        direction: v.union(v.literal("in"), v.literal("out")),
    },
    handler: async (ctx, args) => {
        const isValid = await validateKey(ctx, args.apiKey);
        if (!isValid.valid || !isValid.scopes?.includes('data:write')) {
            throw new Error("Invalid or inactive API Key");
        }

        // 1. Log history
        await ctx.db.insert("car_history", {
            timestamp: Date.now(),
            licensePlate: args.licensePlate,
            direction: args.direction,
        });

        // 2. Update current_cars table
        if (args.direction === "in") {
            // Add to current cars if not exists
            const existing = await ctx.db
                .query("current_cars")
                .withIndex("by_licensePlate", (q) => q.eq("licensePlate", args.licensePlate))
                .first();

            if (!existing) {
                await ctx.db.insert("current_cars", {
                    licensePlate: args.licensePlate,
                });
            }
        } else if (args.direction === "out") {
            // Remove from current cars
            const existing = await ctx.db
                .query("current_cars")
                .withIndex("by_licensePlate", (q) => q.eq("licensePlate", args.licensePlate))
                .first();

            if (existing) {
                await ctx.db.delete(existing._id);
            }
        }

        return { success: true };
    },
});
