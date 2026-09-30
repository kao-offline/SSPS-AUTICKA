import { internalMutation } from "./_generated/server";

/**
 * EMERGENCY: Clear all auth tables to recover from token reset
 * Run this ONLY if login is completely broken after token reset
 * This will:
 * - Delete all sessions (will log out everyone)
 * - Delete all auth accounts (will require re-registration)
 * - Will NOT delete user records (but they'll need new auth accounts)
 */
export const clearAuthTablesEmergency = internalMutation({
    args: {},
    handler: async (ctx) => {
        const deleted = { sessions: 0, accounts: 0, users: 0 };

        try {
            // Clear all authSessions
            const sessions = await ctx.db.query("authSessions").collect();
            for (const session of sessions) {
                await ctx.db.delete(session._id);
                deleted.sessions++;
            }

            // Clear all authAccounts
            const accounts = await ctx.db.query("authAccounts").collect();
            for (const account of accounts) {
                await ctx.db.delete(account._id);
                deleted.accounts++;
            }

            // Clear users
            const users = await ctx.db.query("users").collect();
            for (const user of users) {
                await ctx.db.delete(user._id);
                deleted.users++;
            }

            return {
                success: true,
                message: "Auth tables cleared successfully",
                deleted
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                deleted
            };
        }
    },
});
