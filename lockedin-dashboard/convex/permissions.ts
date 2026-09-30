import { ConvexError } from "convex/values";
import { ActionCtx, QueryCtx, MutationCtx, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

export const currentUserForAuthorization = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    const id = await getAuthUserId(ctx);
    return id ? ctx.db.get(id) : null;
  },
});

export function userMetadata(user: Doc<"users">): { role?: string; plugins?: string; isActive?: boolean } {
  try { return JSON.parse(user.usrData || "{}"); } catch { return {}; }
}

export async function checkAuthenticated(ctx: AuthCtx): Promise<Doc<"users">> {
  const id = await getAuthUserId(ctx);
  const user = id
    ? ("db" in ctx ? await ctx.db.get(id) : await ctx.runQuery(internal.permissions.currentUserForAuthorization, {}))
    : null;
  if (!user) throw new ConvexError("Unauthorized: Authentication required");
  if (user.isApproved === false || userMetadata(user).isActive === false) {
    throw new ConvexError("Forbidden: Account is not approved or active");
  }
  return user;
}

export async function checkAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await checkAuthenticated(ctx);
  if (userMetadata(user).role !== "admin") throw new ConvexError("Forbidden: Admin privileges required");
  return user;
}

export async function checkPluginAccess(ctx: AuthCtx, pluginName: string) {
  const user = await checkAuthenticated(ctx);
  const data = userMetadata(user);
  if (data.role !== "admin" && !data.plugins?.split(",").map(name => name.trim()).includes(pluginName)) {
    throw new ConvexError("Forbidden: Plugin is not assigned to this user");
  }
  return user;
}
