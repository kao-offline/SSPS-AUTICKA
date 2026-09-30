import { checkAuthenticated } from "./permissions";
/**
 * Secured Spaces API
 * All mutations and queries require authentication
 */

import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

// ============================================================================
// SPACE MANAGEMENT MUTATIONS (SECURED)
// ============================================================================

export const update_fullness = mutation({
    args: {
        spaceName: v.string(),
        isFull: v.boolean(),
    },
    handler: async (ctx, args) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        // Find the space by name
        const existingSpace = await ctx.db
            .query("spaces")
            .withIndex("by_spaceName", (q) => q.eq("spaceName", args.spaceName))
            .first();

        if (existingSpace) {
            // Update existing space
            await ctx.db.patch(existingSpace._id, {
                isFull: args.isFull,
            });
        } else {
            // Create new space if it doesn't exist
            await ctx.db.insert("spaces", {
                spaceName: args.spaceName,
                isFull: args.isFull,
            });
        }
    },
});


// ============================================================================
// LICENSE PLATE TRACKING MUTATIONS (SECURED)
// ============================================================================

// Car enters the area
export const car_entered = mutation({
    args: {
        licensePlate: v.string(),
    },
    handler: async (ctx, args) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        // Check if car is already in area
        const existingCar = await ctx.db
            .query("current_cars")
            .withIndex("by_licensePlate", (q) => q.eq("licensePlate", args.licensePlate))
            .first();

        if (existingCar) {
            // Car already in area, don't add again
            throw new Error(`Car ${args.licensePlate} already in area`);
        }

        // Add to current cars
        await ctx.db.insert("current_cars", {
            licensePlate: args.licensePlate,
        });

        // Add entry to history
        await ctx.db.insert("car_history", {
            timestamp: Date.now(),
            licensePlate: args.licensePlate,
            direction: "in",
        });
    },
});

// Car exits the area
export const car_exited = mutation({
    args: {
        licensePlate: v.string(),
    },
    handler: async (ctx, args) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        // Find car in current cars
        const existingCar = await ctx.db
            .query("current_cars")
            .withIndex("by_licensePlate", (q) => q.eq("licensePlate", args.licensePlate))
            .first();

        if (!existingCar) {
            // Car not in area
            throw new Error(`Car ${args.licensePlate} not found in area`);
        }

        // Remove from current cars
        await ctx.db.delete(existingCar._id);

        // Add exit to history
        await ctx.db.insert("car_history", {
            timestamp: Date.now(),
            licensePlate: args.licensePlate,
            direction: "out",
        });
    },
});


// ============================================================================
// LICENSE PLATE QUERIES (SECURED)
// ============================================================================

// Get all cars currently in area
export const get_current_cars = query({
    args: {},
    handler: async (ctx) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        return await ctx.db.query("current_cars").collect();
    },
});

// Check if specific car is present
export const is_car_present = query({
    args: {
        licensePlate: v.string(),
    },
    handler: async (ctx, args) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        const car = await ctx.db
            .query("current_cars")
            .withIndex("by_licensePlate", (q) => q.eq("licensePlate", args.licensePlate))
            .first();

        return car !== null;
    },
});

// Get history for specific license plate
export const get_car_history = query({
    args: {
        licensePlate: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        const historyQuery = ctx.db
            .query("car_history")
            .withIndex("by_licensePlate", (q) => q.eq("licensePlate", args.licensePlate))
            .order("desc");

        if (args.limit) {
            return await historyQuery.take(args.limit);
        }

        return await historyQuery.collect();
    },
});

// Get all car history (not filtered by license plate)
export const get_all_history = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await checkAuthenticated(ctx);
        // Require authentication
        const userId = await getAuthUserId(ctx);
        if (userId === null) {
            throw new Error("Unauthorized: Authentication required");
        }

        const historyQuery = ctx.db
            .query("car_history")
            .order("desc");

        if (args.limit) {
            return await historyQuery.take(args.limit);
        }

        return await historyQuery.collect();
    },
});
