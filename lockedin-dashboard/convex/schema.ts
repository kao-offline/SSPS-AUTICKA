import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // Convex Auth tables with custom users table
  ...authTables,

  // Override the users table to add our custom fields
  users: defineTable({
    // Standard Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()), // We use this to store username
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // Our custom fields for migration from usrs table
    username: v.optional(v.string()), // Actual username
    usrData: v.optional(v.string()),  // JSON string with user metadata (role, permissions, etc.)

    // Account approval system
    isApproved: v.optional(v.boolean()), // false = pending approval, true = approved
    createdAt: v.optional(v.number()),   // Account creation timestamp
  })
    .index("email", ["email"])
    .index("username", ["username"])
    .index("isApproved", ["isApproved"]), // Index for finding pending approvals

  // Existing tables
  usrs: defineTable({
    hashPassword: v.string(),
    username: v.string(),
    usrData: v.string(),
  }).index("by_usrname", ["username"]),

  plugins: defineTable({
    name: v.string(),
    displayName: v.optional(v.string()),
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
    apiEndpoints: v.optional(v.array(v.string())), // List of API endpoints this plugin exposes
  }).index("by_name", ["name"]),

  // Plugin-specific data storage
  pluginData: defineTable({
    pluginName: v.string(), // Plugin that owns this data
    key: v.string(), // Data key
    value: v.string(), // JSON stringified value
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plugin_and_key", ["pluginName", "key"])
    .index("by_plugin", ["pluginName"]),

  // Plugin-specific file storage
  pluginFiles: defineTable({
    pluginName: v.string(), // Plugin that owns this file
    fileName: v.string(), // File name/identifier
    fileId: v.id("_storage"), // Reference to actual file in storage
    mimeType: v.string(), // File MIME type
    size: v.number(), // File size in bytes
    metadata: v.optional(v.string()), // JSON stringified metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plugin_and_name", ["pluginName", "fileName"])
    .index("by_plugin", ["pluginName"]),

  // Shared data between plugins
  pluginSharedData: defineTable({
    ownerPlugin: v.string(), // Plugin that created the shared data
    channel: v.string(), // Logical channel/topic
    key: v.string(), // Shared key
    value: v.string(), // JSON stringified value
    visibility: v.union(v.literal("public"), v.literal("allowlist"), v.literal("private")),
    targetPlugin: v.optional(v.string()), // Required for private visibility
    allowedPlugins: v.optional(v.array(v.string())), // Used for allowlist visibility
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_key", ["ownerPlugin", "channel", "key"])
    .index("by_channel", ["channel"])
    .index("by_target", ["targetPlugin", "channel"]),

  spaces: defineTable({
    spaceName: v.string(),
    isFull: v.boolean(),
  }).index("by_spaceName", ["spaceName"]),

  // Current cars in area (only stores license plate)
  current_cars: defineTable({
    licensePlate: v.string(),
  }).index("by_licensePlate", ["licensePlate"]),

  // History of all entries and exits
  car_history: defineTable({
    timestamp: v.number(),
    licensePlate: v.string(),
    direction: v.string(), // "in" or "out"
  })
    .index("by_licensePlate", ["licensePlate"])
    .index("by_timestamp", ["timestamp"]),

  // On-site servers (Data Server) - pending discovery/binding
  pendingServers: defineTable({
    serverInstanceId: v.string(),
    bindKeyHash: v.string(),
    createdAt: v.number(),
    lastSeen: v.number(),
    serverInfo: v.optional(v.string()), // JSON
    capabilities: v.optional(v.string()), // JSON
    publicIp: v.optional(v.string()), // advertised public IP (cached hourly on device)
    tunnelUrl: v.optional(v.string()), // loca.lt tunnel to local agent (direct contact)
    boundServerId: v.optional(v.id("servers")),
  })
    .index("by_instance", ["serverInstanceId"])
    .index("by_bindKeyHash", ["bindKeyHash"])
    .index("by_boundServerId", ["boundServerId"]),

  // Bound on-site servers
  servers: defineTable({
    serverInstanceId: v.string(),
    name: v.optional(v.string()),
    token: v.string(),
    createdAt: v.number(),
    lastSeen: v.number(),
    serverInfo: v.optional(v.string()), // JSON
    capabilities: v.optional(v.string()), // JSON
    publicIp: v.optional(v.string()), // advertised public IP (cached hourly on device)
    tunnelUrl: v.optional(v.string()), // loca.lt tunnel to local agent (direct contact)
    status: v.optional(v.string()),
  })
    .index("by_instance", ["serverInstanceId"])
    .index("by_token", ["token"]),

  // Server module marketplace (uploaded module zips)
  serverMarketplaceModules: defineTable({
    moduleId: v.string(),
    name: v.string(),
    version: v.optional(v.string()),
    entrypoint: v.optional(v.string()),
    manifest: v.optional(v.string()), // JSON
    artifactFileId: v.id("_storage"),
    uploadedAt: v.number(),
    uploadedBy: v.id("users"),
    isActive: v.optional(v.boolean()),
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_module", ["moduleId"])
    .index("by_module_and_version", ["moduleId", "version"])
    .index("by_uploadedAt", ["uploadedAt"]),
  // Server modules (Python subprocess modules)
  serverModules: defineTable({
    serverId: v.id("servers"),
    moduleId: v.string(),
    name: v.string(),
    version: v.optional(v.string()),
    entrypoint: v.optional(v.string()),
    manifest: v.optional(v.string()), // JSON
    artifactFileId: v.optional(v.id("_storage")),
    marketplaceId: v.optional(v.id("serverMarketplaceModules")),
    desiredConfig: v.optional(v.string()), // JSON

    allowedEndpoints: v.array(v.string()),
    apiKeyId: v.id("apiKeys"),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.optional(v.string()),
  })
    .index("by_server", ["serverId"])
    .index("by_server_and_module", ["serverId", "moduleId"]),

  // API Keys for external integrations (IoT, plugins, external apps, server modules)
  apiKeys: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    lastUsed: v.optional(v.number()),
    isActive: v.boolean(),

    // Key kind for UI/ops
    kind: v.optional(v.union(v.literal("MANUAL"), v.literal("SERVER_MODULE"))),
    serverId: v.optional(v.id("servers")),
    serverModuleId: v.optional(v.string()),

    // Scopes - what parts of the app this key can access
    scopes: v.array(v.string()), // e.g. ["plugin:read", "plugin:write", "data:read", "data:write", "api:call"]

    // Plugin access control
    allowedPlugins: v.optional(v.array(v.string())), // Empty = all plugins, specified = only these plugins

    // Data scope restrictions
    dataScopes: v.optional(v.array(v.string())), // e.g. ["parking-data:read", "parking-data:write"]

    // API endpoint restrictions (for blocking/allowing specific endpoints)
    allowedEndpoints: v.optional(v.array(v.string())), // Empty = all endpoints, specified = only these
    blockedEndpoints: v.optional(v.array(v.string())), // Explicitly blocked endpoints

    // Rate limiting
    rateLimit: v.optional(v.number()), // Requests per minute, 0 = unlimited
    requestCount: v.optional(v.number()), // Current request count in window
    rateLimitWindow: v.optional(v.number()), // Timestamp of current rate limit window
  })
    .index("by_key", ["key"])
    .index("by_creator", ["createdBy"])
    .index("by_active", ["isActive"]),
});
