import React, { useEffect, useRef } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { createPluginSDK } from '@/lib/pluginSDK';
import * as HeroUI from '@heroui/react';
import * as ReactDOMClient from 'react-dom/client';

interface BackgroundPluginManagerProps {
  plugins: Array<{ name: string; coreFileId: string; manifestFileId: string }>;
  username?: string;
  userData?: Record<string, unknown>;
}

// Global store for background-loaded plugins
const backgroundPlugins = new Map<string, any>();
const pluginSDKs = new Map<string, any>(); // Store SDK instances per plugin

export function getBackgroundPlugin(pluginName: string) {
  return backgroundPlugins.get(pluginName);
}

export function getAllBackgroundPlugins() {
  return Array.from(backgroundPlugins.values());
}

/**
 * BackgroundPluginManager
 *
 * Loads all enabled plugins in the background without displaying UI.
 * This allows plugins to communicate with each other via shared data.
 */
export const BackgroundPluginManager: React.FC<BackgroundPluginManagerProps> = ({
  plugins,
  username,
  userData,
}) => {
  const convexClient = useConvex();
  const loadedPluginsRef = useRef<Map<string, string>>(new Map());
  const loadGeneration = useRef(0);
  useEffect(() => {
    const loaded = loadedPluginsRef.current;
    return () => {
      loadGeneration.current++;
      loaded.forEach((_version, name) => unloadBackgroundPlugin(name));
      loaded.clear();
    };
  }, []);

  useEffect(() => {
    const incomingPlugins = plugins ?? [];
    const incomingNames = new Set(incomingPlugins.map((plugin) => plugin.name));

    // Remove background instances for plugins that are no longer assigned.
    Array.from(loadedPluginsRef.current.keys()).forEach((loadedPluginName) => {
      if (!incomingNames.has(loadedPluginName)) {
        console.log(`[BackgroundPluginManager] Unloading removed plugin: ${loadedPluginName}`);
        unloadBackgroundPlugin(loadedPluginName);
        loadedPluginsRef.current.delete(loadedPluginName);
      }
    });

    if (incomingPlugins.length === 0) {
      return;
    }

    // Load all plugins in background
    console.log('[BackgroundPluginManager] Loading plugins:', incomingPlugins.map(p => p.name).join(', '));
    incomingPlugins.forEach((plugin) => {
      const loadedCoreFileId = loadedPluginsRef.current.get(plugin.name);

      // Skip if the same plugin version is already loaded.
      if (loadedCoreFileId === plugin.coreFileId) {
        console.log(`[BackgroundPluginManager] Skipping already loaded: ${plugin.name}`);
        return;
      }

      // If plugin was reuploaded, unload the old instance and reload with new files.
      if (loadedCoreFileId && loadedCoreFileId !== plugin.coreFileId) {
        console.log(`[BackgroundPluginManager] Reloading updated plugin: ${plugin.name}`);
        unloadBackgroundPlugin(plugin.name);
      }

      console.log(`[BackgroundPluginManager] Queuing load: ${plugin.name}`);
      const generation = loadGeneration.current;
      void loadBackgroundPlugin(plugin.name, plugin.coreFileId, username, userData, convexClient, () => generation === loadGeneration.current);
      loadedPluginsRef.current.set(plugin.name, plugin.coreFileId);
    });

  }, [plugins, username, userData, convexClient]);

  return null; // No UI
};

/**
 * Load a plugin in the background
 */
async function loadBackgroundPlugin(
  pluginName: string,
  coreFileId: string,
  username?: string,
  userData?: Record<string, unknown>,
  convexClient?: any,
  isCurrent: () => boolean = () => true
) {
  try {
    console.log(`[BackgroundPluginManager] Loading plugin: ${pluginName}`);

    // Use authenticated convex client throughout
    const clientToUse = convexClient || (window as any).convexClient;

    // Get the core file URL from Convex storage
    const coreUrl = await clientToUse.query(api.context.getFileUrl, {
      fileId: coreFileId,
    });

    if (!coreUrl) {
      console.error(`[BackgroundPluginManager] Failed to get core file URL for plugin: ${pluginName}`);
      return;
    }

    // Fetch the core content from Convex storage URL
    const response = await fetch(coreUrl);
    if (!response.ok) {
      console.error(`[BackgroundPluginManager] Failed to fetch plugin code:`, pluginName, response.statusText);
      return;
    }

    const coreContent = await response.text();

    if (!coreContent) {
      console.error(`[BackgroundPluginManager] No core content loaded for plugin: ${pluginName}`);
      return;
    }

    if (!isCurrent()) return;

    // Process code and wrap for execution
    const processedCode = coreContent
      .replace(/export\s+default\s+(\w+);?/g, 'window.TempBackgroundPlugin = $1;')
      .replace(/export\s+const\s+(\w+)\s*=/g, 'window.$1 =')
      .replace(/export\s+function\s+(\w+)/g, 'window.$1 = function $1')
      .replace(/export\s+class\s+(\w+)/g, 'window.$1 = class $1')
      .replace(/export\s*\{[^}]*\}/g, '')
      .replace(/import\s+.*?from\s+['"][^'"]*['"];?/g, '');

    // Wrap and execute plugin code
    const wrappedCode = `
      (function() {
        try {
          ${processedCode}
          if (typeof TestPlugin !== 'undefined') {
            window.TempBackgroundPlugin = TestPlugin;
          }
        } catch (e) {
          console.error('Background plugin execution error:', e);
          window.TempBackgroundPluginError = e;
        }
      })();
    `;

    // Expose SDK and React globally for plugins
    if (typeof window !== 'undefined') {
      // SDK will be set on the window object by the main dashboard
      if (!(window as any).PluginSDK) {
        console.warn(`[BackgroundPluginManager] PluginSDK not available for ${pluginName}`);
      }
    }

    // Execute the wrapped code
    console.log(`[BackgroundPluginManager] Executing plugin code: ${pluginName}`);
    eval(wrappedCode);

    // Check for execution errors
    if ((window as any).TempBackgroundPluginError) {
      console.error(`[BackgroundPluginManager] Plugin execution error:`, (window as any).TempBackgroundPluginError);
      delete (window as any).TempBackgroundPluginError;
      return;
    }

    // Expose runtime libraries for background plugins
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).PluginRuntime = {
        React,
        ReactDOMClient,
        HeroUI,
      };
      (window as unknown as Record<string, unknown>).HeroUI = HeroUI;
    }

    // Get the loaded plugin class - try multiple detection strategies
    let PluginClass = (window as any).TempBackgroundPlugin;

    // If not found, try to find by plugin-specific name patterns
    if (!PluginClass) {
      // Convert plugin name to PascalCase class name (e.g., "camera-management" -> "CameraManagementPlugin")
      const pascalName = pluginName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('') + 'Plugin';

      PluginClass = (window as any)[pascalName];

      if (PluginClass) {
        console.log(`[BackgroundPluginManager] Found plugin class by name convention: ${pascalName}`);
      }
    }

    // If still not found, search for any new Plugin class on window
    if (!PluginClass) {
      const pluginKeys = Object.keys(window).filter(k =>
        k.includes('Plugin') && typeof (window as any)[k] === 'function'
      );
      console.error(`[BackgroundPluginManager] Failed to load plugin class: ${pluginName}`);
      console.error(`[BackgroundPluginManager] Available plugin classes:`, pluginKeys);
      return;
    }
    console.log(`[BackgroundPluginManager] Plugin class loaded: ${pluginName}`);

    // Create SDK instance for this plugin
    const pluginContext = {
      pluginName,
      username,
      userData,
      convexClient: clientToUse,
    };
    const sdkInstance = createPluginSDK(pluginContext);

    // Create plugin instance
    const instance = new PluginClass();

    // **Attach SDK to plugin instance so it persists**
    (instance as any).PluginSDK = sdkInstance;

    // Create container for plugin UI (hidden)
    const hiddenContainer = document.createElement('div');
    hiddenContainer.id = `plugin-bg-${pluginName}`;
    hiddenContainer.style.display = 'none';
    document.body.appendChild(hiddenContainer);

    // Initialize the plugin with SDK (set global temporarily)
    (window as any).PluginSDK = sdkInstance;

    console.log(`[BackgroundPluginManager] SDK created for ${pluginName}, now initializing...`);

    if (typeof instance.initialize === 'function') {
      instance.initialize({
        pluginName,
        username,
        userData,
        convexClient: clientToUse,
        runtime: (window as any).PluginRuntime,
        sdkFactory: (ctx: any) => createPluginSDK(ctx),
      });
    }

    // Create UI container (hidden)
    if (typeof instance.createUI === 'function') {
      instance.createUI(hiddenContainer);
    }

    // Store the plugin instance globally for inter-plugin communication
    backgroundPlugins.set(pluginName, instance);

    // **Store SDK instance for later use**
    pluginSDKs.set(pluginName, sdkInstance);

    console.log(`[BackgroundPluginManager] Stored SDK for ${pluginName}, setting up polling...`);

    // Set up periodic polling for inter-plugin communication
    if (typeof instance.onUpdate === 'function') {
      const pollInterval = setInterval(() => {
        try {
          // **Set the correct SDK for this plugin before calling onUpdate**
          (window as any).PluginSDK = pluginSDKs.get(pluginName);

          instance.onUpdate?.({
            timestamp: Date.now(),
            activePlugins: Array.from(backgroundPlugins.keys()),
          });
        } catch (error) {
          console.error(`[BackgroundPluginManager] Error in plugin update for ${pluginName}:`, error);
        }
      }, 3000); // Poll every 3 seconds

      // Store interval for cleanup if needed
      (instance as any)._pollInterval = pollInterval;
    }

    // Bridge external API calls (stored in pluginData as api_call_*) to runtime events.
    const apiBridgeInterval = setInterval(async () => {
      try {
        const sdk = pluginSDKs.get(pluginName);
        if (!sdk || typeof sdk.getAllData !== 'function') {
          return;
        }

        const dataRows = await sdk.getAllData();
        const pendingCalls = dataRows.filter((row: any) =>
          row?.key?.startsWith('api_call_') && row?.value?.status === 'pending'
        );

        for (const row of pendingCalls) {
          const call = row.value;
          if (!call || call.pluginAlias !== pluginName) {
            continue;
          }

          const isFrameEndpoint =
            call.endpoint === 'onStreamFrame' || call.endpoint === 'emitStreamFrame';

          if (isFrameEndpoint) {
            const streamId = call.body?.streamId;
            const frame = call.body?.frame ?? call.body?.frameData;
            const frameName = call.body?.frameName ?? call.body?.cameraName ?? call.body?.name;

            if (typeof streamId === 'string' && typeof frame === 'string') {
              sdk.emitStreamFrame(streamId, frame);

              const cameras = (await sdk.getData('cameras')) || [];
              const pendingKey = 'externalFeedRequests';
              let targetChannel: string | null = null;

              if (Array.isArray(cameras) && cameras.length > 0) {
                // 1) Exact stream match via streamId / camera id
                const byId = cameras.find((cam: any) => cam?.id === streamId || cam?.streamId === streamId);
                if (byId?.id) {
                  targetChannel = byId.streamId || byId.id;
                } else if (typeof frameName === 'string' && frameName.trim().length > 0) {
                  // 2) Name-based match using payload frameName/cameraName
                  const normalized = frameName.trim().toLowerCase();
                  const byName = cameras.find((cam: any) =>
                    typeof cam?.name === 'string' && cam.name.trim().toLowerCase() === normalized
                  );

                  if (byName?.id) {
                    targetChannel = byName.streamId || byName.id;
                  } else {
                    // 3) Unknown feed -> queue pending approval request instead of auto-creating.
                    const pending = await sdk.getData(pendingKey);
                    const pendingList = Array.isArray(pending) ? pending : [];
                    const requestId = `${streamId}::${normalized}`;
                    const now = Date.now();
                    const idx = pendingList.findIndex((item: any) => item?.id === requestId);

                    if (idx >= 0) {
                      pendingList[idx] = {
                        ...pendingList[idx],
                        lastSeenAt: now,
                      };
                    } else {
                      console.log(`[APIBridge] New pending request: "${frameName}" on stream "${streamId}"`);
                      pendingList.push({
                        id: requestId,
                        name: frameName,
                        streamId,
                        firstSeenAt: now,
                        lastSeenAt: now,
                        status: 'pending',
                      });
                    }

                    await sdk.setData(pendingKey, pendingList);
                  }
                }
              } else {
                // No camera list yet: queue as pending if name is available.
                if (typeof frameName === 'string' && frameName.trim().length > 0) {
                  const normalized = frameName.trim().toLowerCase();
                  const pending = await sdk.getData(pendingKey);
                  const pendingList = Array.isArray(pending) ? pending : [];
                  const requestId = `${streamId}::${normalized}`;
                  const now = Date.now();
                  const idx = pendingList.findIndex((item: any) => item?.id === requestId);

                  if (idx >= 0) {
                    pendingList[idx] = {
                      ...pendingList[idx],
                      lastSeenAt: now,
                    };
                  } else {
                    console.log(`[APIBridge] New pending request (no cameras yet): "${frameName}" on stream "${streamId}"`);
                    pendingList.push({
                      id: requestId,
                      name: frameName,
                      streamId,
                      firstSeenAt: now,
                      lastSeenAt: now,
                      status: 'pending',
                    });
                  }

                  await sdk.setData(pendingKey, pendingList);
                }
              }

              if (targetChannel) {
                console.log(`[APIBridge] Emitting frame to: "${targetChannel}"`);
                if (targetChannel !== streamId) {
                  sdk.emitStreamFrame(targetChannel, frame);
                }
                // Emit a short burst to catch listeners that mount right after approval.
                const retryDelays = [250, 800];
                retryDelays.forEach((delayMs) => {
                  setTimeout(() => {
                    try {
                      sdk.emitStreamFrame(streamId, frame);
                      if (targetChannel !== streamId) {
                        sdk.emitStreamFrame(targetChannel as string, frame);
                      }
                    } catch (err) {
                      console.error('[APIBridge] Delayed emit error:', err);
                    }
                  }, delayMs);
                });
              }

              await sdk.setData(row.key, {
                ...call,
                status: 'processed',
                processedAt: Date.now(),
              });
              continue;
            }
          }

          // Mark unknown or invalid payloads to avoid repeated re-processing.
          await sdk.setData(row.key, {
            ...call,
            status: 'ignored',
            ignoredAt: Date.now(),
          });
        }
      } catch (error) {
        console.error(`[BackgroundPluginManager] API bridge error for ${pluginName}:`, error);
      }
    }, 500);

    (instance as any)._apiBridgeInterval = apiBridgeInterval;

    // Cleanup global reference
    delete (window as any).TempBackgroundPlugin;

    console.log(`[BackgroundPluginManager] Successfully loaded: ${pluginName}`);
  } catch (error) {
    console.error(`[BackgroundPluginManager] Error loading plugin ${pluginName}:`, error);
  }
}

export function unloadBackgroundPlugin(pluginName: string) {
  const instance = backgroundPlugins.get(pluginName);

  if (instance) {
    if ((instance as any)._pollInterval) {
      clearInterval((instance as any)._pollInterval);
    }

    if ((instance as any)._apiBridgeInterval) {
      clearInterval((instance as any)._apiBridgeInterval);
    }

    if (typeof instance.destroy === 'function') {
      try {
        instance.destroy();
      } catch (error) {
        console.error(`[BackgroundPluginManager] Error destroying ${pluginName}:`, error);
      }
    }
  }

  const hiddenContainer = document.getElementById(`plugin-bg-${pluginName}`);
  hiddenContainer?.remove();

  backgroundPlugins.delete(pluginName);
  pluginSDKs.delete(pluginName);
}

export default BackgroundPluginManager;
