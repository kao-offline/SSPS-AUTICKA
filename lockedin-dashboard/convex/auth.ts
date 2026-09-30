import "./authEnv"; // MUST BE FIRST
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { DataModel } from "./_generated/dataModel";
import { passwordCrypto } from "./passwordCrypto";

/**
 * Custom Password provider configured for USERNAME + PASSWORD (not email)
 * This allows users to log in with username instead of email
 */

// NOTE: Environment variables are set by authEnv.ts which runs first.

/**
 * Convex Auth Password Provider with Username Support
 * 
 * New accounts are created with isApproved: false and must be approved by admin.
 */
const UsernamePassword = Password<DataModel>({
    // profile() is called when creating a new user
    // It maps provider params to the users table fields
    profile(params) {
        const normalizedUsername = String(params.email ?? "").trim().toLowerCase();
        if (!normalizedUsername || normalizedUsername.length > 100) throw new Error("Invalid username");
        // params.email comes from the form (contains username)
        return {
            email: normalizedUsername,      // Store username here
            name: normalizedUsername,       // Use as name too
            username: normalizedUsername,   // Custom field for username
            isApproved: false,        // ALL new accounts start as unapproved
            createdAt: Date.now(),    // Track when account was created
        };
    },
    crypto: passwordCrypto,
});

export const { auth, signIn, signOut, store } = convexAuth({
    providers: [UsernamePassword],
    callbacks: {
        async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
            if (existingUserId) return;
            // Runs in the account creation transaction, so concurrent signups
            // cannot both become the initial administrator.
            const otherUser = (await ctx.db.query("users").take(2)).some(user => user._id !== userId);
            const legacyUser = await ctx.db.query("usrs").first();
            await ctx.db.patch(userId, {
                isApproved: !otherUser && !legacyUser,
                usrData: JSON.stringify({ role: !otherUser && !legacyUser ? "admin" : "user", isActive: true }),
            });
        },
    },
});
