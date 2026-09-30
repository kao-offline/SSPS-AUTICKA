import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import bcrypt from "bcryptjs";

export const fixAdminUser = internalMutation({
    args: { username: v.string(), password: v.string() },
    handler: async (ctx, args) => {
        const username = args.username;
        const normalizedUsername = username.trim().toLowerCase();
        const password = args.password;
        if (password.length < 8) throw new Error("Password must have at least 8 characters");

        // 1. Find or create user "admin"
        const adminUser = await ctx.db.query("users")
            .withIndex("username", q => q.eq("username", normalizedUsername))
            .first();

        // 2. Hash password
        const hash = bcrypt.hashSync(password, 10);
        let status = "";

        let userId = adminUser?._id;

        if (adminUser) {
            await ctx.db.patch(adminUser._id, {
                isApproved: true,
                usrData: JSON.stringify({ ...JSON.parse(adminUser.usrData || '{}'), role: 'admin', isActive: true }),
            });
            status += `Found User '${normalizedUsername}' (${adminUser._id}). `;
        } else {
            const createdUserId = await ctx.db.insert("users", {
                username: normalizedUsername,
                email: normalizedUsername,
                name: normalizedUsername,
                isApproved: true,
                createdAt: Date.now(),
                usrData: JSON.stringify({ role: 'admin', isActive: true }),
            });
            userId = createdUserId;
            status += `Created user '${normalizedUsername}' (${createdUserId}). `;
        }

        // 3. Update authAccount
        // Check if authAccount exists for this user
        // We assume provider is "password" based on auth.ts config (UsernamePassword)
        // Actually auth.ts config says provider ID is "password" (default).
        // The "UsernamePassword" provider uses "password" as providerId usually unless named.

        // Let's look for any authAccount for this user
        const authAccount = await ctx.db.query("authAccounts")
            .withIndex("userIdAndProvider", q => q.eq("userId", userId).eq("provider", "password"))
            .first();

        if (authAccount) {
            await ctx.db.patch(authAccount._id, {
                secret: hash, providerAccountId: normalizedUsername
            });
            status += 'Password refreshed.';
        } else {
            await ctx.db.insert("authAccounts", {
                userId: userId,
                provider: "password",
                providerAccountId: normalizedUsername,
                secret: hash
            });
            status += 'Auth account created.';
        }

        return status;
    }
});

export const setAdminRole = internalMutation({
    args: {
        username: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const username = args.username || "admin";
        const normalizedUsername = username.trim().toLowerCase();

        // Find user by username
        const user = await ctx.db.query("users")
            .withIndex("username", q => q.eq("username", normalizedUsername))
            .first();

        if (!user) {
            throw new Error(`User '${username}' not found`);
        }

        // Update usrData with admin role
        const usrData = {
            ...JSON.parse(user.usrData || "{}"),
            role: "admin"
        };

        await ctx.db.patch(user._id, {
            usrData: JSON.stringify(usrData),
            isApproved: true
        });

        return `✅ User '${username}' now has admin role`;
    }
});
