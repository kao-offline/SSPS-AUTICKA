/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as TEMP_clearAuth from "../TEMP_clearAuth.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as authEnv from "../authEnv.js";
import type * as clearAuthTables from "../clearAuthTables.js";
import type * as context from "../context.js";
import type * as fixAdmin from "../fixAdmin.js";
import type * as http from "../http.js";
import type * as iot from "../iot.js";
import type * as migration from "../migration.js";
import type * as passwordCrypto from "../passwordCrypto.js";
import type * as permissions from "../permissions.js";
import type * as pluginApi from "../pluginApi.js";
import type * as pluginFramework from "../pluginFramework.js";
import type * as publicApi from "../publicApi.js";
import type * as securedApi from "../securedApi.js";
import type * as securedSpaces from "../securedSpaces.js";
import type * as servers from "../servers.js";
import type * as serversNode from "../serversNode.js";
import type * as spaces from "../spaces.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  TEMP_clearAuth: typeof TEMP_clearAuth;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  authEnv: typeof authEnv;
  clearAuthTables: typeof clearAuthTables;
  context: typeof context;
  fixAdmin: typeof fixAdmin;
  http: typeof http;
  iot: typeof iot;
  migration: typeof migration;
  passwordCrypto: typeof passwordCrypto;
  permissions: typeof permissions;
  pluginApi: typeof pluginApi;
  pluginFramework: typeof pluginFramework;
  publicApi: typeof publicApi;
  securedApi: typeof securedApi;
  securedSpaces: typeof securedSpaces;
  servers: typeof servers;
  serversNode: typeof serversNode;
  spaces: typeof spaces;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
