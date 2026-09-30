import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { checkAuthenticated } from "./permissions";

export const currentUser = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        const user = await ctx.db.get(userId);
        if (!user) {
            return null;
        }

        // Parse usrData if it exists and is a string
        let parsedUsrData = {};
        if (user.usrData) {
            try {
                parsedUsrData = JSON.parse(user.usrData);
            } catch (e) {
                console.error("Failed to parse usrData", e);
            }
        }

        // Resolve image storage ID → real URL
        let imageUrl: string | null = null;
        if (user.image) {
            if ((user.image as string).startsWith('http')) {
                // Already a full URL
                imageUrl = user.image as string;
            } else {
                try {
                    imageUrl = await ctx.storage.getUrl(user.image as unknown as Id<"_storage">);
                } catch {
                    imageUrl = null;
                }
            }
        }

        return {
            ...parsedUsrData,
            ...user,
            imageUrl,
        };
    },
});

// Self-service: update own username
export const updateCurrentUsername = mutation({
    args: {
        username: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await checkAuthenticated(ctx);
        const username = args.username.trim().toLowerCase();
        if (!username || username.length > 100) throw new ConvexError("Invalid username");
        const duplicate = await ctx.db.query("users").withIndex("username", q => q.eq("username", username)).first();
        const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", username)).first();
        if ((duplicate && duplicate._id !== user._id) || (account && account.userId !== user._id)) throw new ConvexError("Username already exists");
        const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", user._id).eq("provider", "password")).collect();
        for (const item of accounts) await ctx.db.patch(item._id, { providerAccountId: username });
        await ctx.db.patch(user._id, {
            username,
            email: username,
            name: username,
        });
    },
});

export const updateCurrentImage = mutation({
    args: { image: v.id("_storage") },
    handler: async (ctx, args) => {
        const user = await checkAuthenticated(ctx);
        if (!await ctx.storage.getMetadata(args.image)) throw new ConvexError("Image not found");
        await ctx.db.patch(user._id, { image: args.image });
    },
});
