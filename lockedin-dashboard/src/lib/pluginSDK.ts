/**
 * Plugin SDK - Client-side helper library for plugins
 * 
 * This library provides a simple and consistent interface for plugins to interact
 * with the plugin framework, including data storage, file management, user profiles,
 * and role-based permissions.
 */

interface PluginContext {
  pluginName: string;
  convexClient: any;
  username?: string;
  userData?: any;
}

interface PluginRedirectPayload {
  fromPlugin: string;
  targetPlugin: string;
  trigger?: string;
  payload?: any;
  timestamp: number;
}

const PLUGIN_REDIRECT_EVENT = 'plugin:redirect';
const PLUGIN_REDIRECT_STORE_KEY = '__pluginRedirectPayloads';
const PLUGIN_STREAM_FRAME_CACHE_KEY = '__pluginStreamFrameCache';

export class PluginSDK {
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  // ============================================================================
  // DATA STORAGE API
  // ============================================================================

  /**
   * Set a value in plugin data storage
   */
  async setData(key: string, value: any): Promise<string> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.mutation('pluginFramework:setPluginData', {
      pluginName,
      key,
      value: JSON.stringify(value),
    });
  }

  /**
   * Get a value from plugin data storage
   */
  async getData(key: string): Promise<any | null> {
    const { pluginName, convexClient } = this.context;
    
    const value = await convexClient.query('pluginFramework:getPluginData', {
      pluginName,
      key,
    });

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Get all data for this plugin
   */
  async getAllData(): Promise<Array<{ key: string; value: any }>> {
    const { pluginName, convexClient } = this.context;
    
    const data = await convexClient.query('pluginFramework:getAllPluginData', {
      pluginName,
    });

    return data.map((item: any) => ({
      key: item.key,
      value: JSON.parse(item.value),
    }));
  }

  /**
   * Delete a value from plugin data storage
   */
  async deleteData(key: string): Promise<boolean> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.mutation('pluginFramework:deletePluginData', {
      pluginName,
      key,
    });
  }

  /**
   * Clear all data for this plugin
   */
  async clearAllData(): Promise<{ deleted: number }> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.mutation('pluginFramework:clearAllPluginData', {
      pluginName,
    });
  }

  /**
   * Get all data keys for this plugin (convenience method)
   */
  async listKeys(): Promise<string[]> {
    const data = await this.getAllData();
    return data.map((item: any) => item.key);
  }

  /**
   * Store a file (alias for storeFile)
   */
  async uploadFile(file: File): Promise<string> {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          const fileData = reader.result as string;
          const result = await this.storeFile(
            file.name,
            fileData,
            file.type,
            { originalName: file.name }
          );
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // ============================================================================
  // FILE STORAGE API
  // ============================================================================

  /**
   * Store a file
   */
  async storeFile(
    fileName: string,
    fileData: string,
    mimeType: string,
    metadata?: any
  ): Promise<string> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.action('pluginFramework:storePluginFile', {
      pluginName,
      fileName,
      fileData,
      mimeType,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  /**
   * Get file URL
   */
  async getFileUrl(fileName: string): Promise<any | null> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.query('pluginFramework:getPluginFileUrl', {
      pluginName,
      fileName,
    });
  }

  /**
   * Get a public URL for a plugin asset (from assets/ folder)
   */
  async getAssetUrl(assetName: string): Promise<string | null> {
    const { pluginName, convexClient } = this.context;

    const tryGetViaFrameworkAssetQuery = async (name: string): Promise<string | null> => {
      return await convexClient.query('pluginFramework:getPluginAssetUrl', {
        pluginName,
        assetName: name,
      });
    };

    const tryGetViaContextAssetQuery = async (name: string): Promise<string | null> => {
      return await convexClient.query('context:getPluginAssetUrl', {
        pluginName,
        assetName: name,
      });
    };

    const tryGetViaFileQuery = async (name: string): Promise<string | null> => {
      const file = await convexClient.query('pluginFramework:getPluginFileUrl', {
        pluginName,
        fileName: name,
      });
      return file?.url ?? null;
    };

    // Support both legacy and current backends, and both stored name formats.
    const candidateNames = [assetName, `assets/${assetName}`];

    for (const candidate of candidateNames) {
      try {
        const fileUrl = await tryGetViaFileQuery(candidate);
        if (fileUrl) return fileUrl;
      } catch {
        // Ignore and try compatibility fallbacks.
      }

      try {
        const contextUrl = await tryGetViaContextAssetQuery(candidate);
        if (contextUrl) return contextUrl;
      } catch {
        // Ignore and continue fallback chain.
      }

      try {
        const frameworkUrl = await tryGetViaFrameworkAssetQuery(candidate);
        if (frameworkUrl) return frameworkUrl;
      } catch {
        // Keep searching other candidates.
      }
    }

    return null;
  }

  /**
   * Get all files for this plugin
   */
  async getAllFiles(): Promise<any[]> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.query('pluginFramework:getAllPluginFiles', {
      pluginName,
    });
  }

  /**
   * Delete a file
   */
  async deleteFile(fileName: string): Promise<boolean> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.action('pluginFramework:deletePluginFile', {
      pluginName,
      fileName,
    });
  }

  /**
   * Clear all files for this plugin
   */
  async clearAllFiles(): Promise<{ deleted: number }> {
    const { pluginName, convexClient } = this.context;
    
    return await convexClient.action('pluginFramework:clearAllPluginFiles', {
      pluginName,
    });
  }

  // ============================================================================
  // USER PROFILE & PERMISSIONS API
  // ============================================================================

  /**
   * Get current user's profile
   */
  async getCurrentUser(): Promise<any | null> {
    const { convexClient } = this.context;
    
    try {
      return await (convexClient as any).query('pluginFramework:getCurrentUserProfile', {});
    } catch (error) {
      console.error('[PluginSDK] Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get user profile by username
   */
  async getUserProfile(username: string): Promise<any | null> {
    const { convexClient, pluginName } = this.context;
    
    // Guard: validate username parameter
    if (!username || typeof username !== 'string') {
      console.warn(`[PluginSDK:${pluginName}] getUserProfile called with invalid username:`, username);
      return null;
    }
    
    try {
      return await (convexClient as any).query('pluginFramework:getUserProfileByUsername', {
        username,
      });
    } catch (error) {
      console.error(`[PluginSDK:${pluginName}] Error getting user profile for "${username}":`, error);
      return null;
    }
  }

  /**
   * Check if current user has a specific role
   */
  async hasRole(requiredRole: string): Promise<boolean> {
    const { convexClient } = this.context;
    
    try {
      return await (convexClient as any).query('pluginFramework:userHasRole', {
        requiredRole,
      });
    } catch (error) {
      console.error('[PluginSDK] Error checking role:', error);
      return false;
    }
  }

  /**
   * Check if current user has a specific permission
   */
  async hasPermission(permission: string): Promise<boolean> {
    const { convexClient } = this.context;
    
    try {
      return await (convexClient as any).query('pluginFramework:userHasPermission', {
        permission,
      });
    } catch (error) {
      console.error('[PluginSDK] Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if user can access this feature based on role
   */
  async canAccess(requiredRole: 'admin' | 'moderator' | 'user' = 'user'): Promise<boolean> {
    return await this.hasRole(requiredRole);
  }

  // ============================================================================
  // THEME & UI HELPERS
  // ============================================================================

  /**
   * Get current theme (light/dark)
   */
  getTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const selectedTheme = document.documentElement.dataset.theme;
    if (selectedTheme === 'light' || selectedTheme === 'dark') return selectedTheme;

    // Compatibility with hosts that use only a theme class.
    if (document.documentElement.classList.contains('dark')) {
      return 'dark';
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  }

  /**
   * Listen for theme changes
   */
  onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const observer = new MutationObserver(() => {
      callback(this.getTheme());
    });

    // Watch for class changes on html element
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    // Watch for system preference changes
    const handleChange = () => callback(this.getTheme());
    mediaQuery.addEventListener('change', handleChange);

    // Return cleanup function
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleChange);
    };
  }

  /**
   * Call API endpoint (placeholder for compatibility)
   * In reality, plugins define endpoints via registerApiEndpoints
   */
  async callAPI(endpoint: string, params?: any): Promise<any> {
    const { pluginName } = this.context;
    this.log(`API call to ${endpoint} with params:`, params);
    return { success: true, endpoint, plugin: pluginName };
  }

  // ============================================================================
  // API ENDPOINT REGISTRATION
  // ============================================================================

  /**
   * Register API endpoints for this plugin
   * 
   * This allows external applications to call /api/[pluginAlias]/[endpoint]
   */
  async registerApiEndpoints(endpoints: string[]): Promise<{ success: boolean }> {
    const { pluginName, convexClient } = this.context;
    
    try {
      return await (convexClient as any).mutation('pluginFramework:registerPluginApiEndpoints', {
        pluginName,
        endpoints,
      });
    } catch (error) {
      console.error(`[PluginSDK] Error registering API endpoints for ${pluginName}:`, error);
      return { success: false };
    }
  }

  // ============================================================================
  // INTER-PLUGIN SHARED DATA API
  // ============================================================================

  /**
   * Share a value so other plugins can read it
   * Supports flexible signatures for backward compatibility
   */
  async publishSharedData(
    channelOrKey: string,
    keyOrValue?: any,
    valueOrVis?: any,
    visibility: 'public' | 'allowlist' | 'private' = 'public',
    options?: { targetPlugin?: string; allowedPlugins?: string[] }
  ): Promise<string> {
    const { pluginName, convexClient } = this.context;

    // Support both old signature: publishSharedData(key, value) 
    // and new signature: publishSharedData(channel, key, value, visibility)
    let channel = channelOrKey;
    let key = keyOrValue;
    let value = valueOrVis;

    // If called with just 2 params, use channel as both channel and key
    if (valueOrVis === undefined && typeof keyOrValue === 'object') {
      channel = channelOrKey;
      key = channelOrKey;
      value = keyOrValue;
    }

    console.log(`[PluginSDK:${pluginName}] Publishing to channel "${channel}", key "${key}", visibility: ${visibility}`);
    console.log(`[PluginSDK:${pluginName}] Full params:`, {
      ownerPlugin: pluginName,
      channel,
      key,
      valuePreview: typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : value
    });
    
    try {
      const result = await (convexClient as any).mutation('pluginFramework:publishSharedData', {
        ownerPlugin: pluginName,
        channel,
        key,
        value: JSON.stringify(value),
        visibility,
        targetPlugin: options?.targetPlugin,
        allowedPlugins: options?.allowedPlugins,
      });
      
      console.log(`[PluginSDK:${pluginName}] Successfully published. Record ID: ${result}`);
      return result;
    } catch (error) {
      console.error(`[PluginSDK:${pluginName}] Failed to publish shared data:`, error);
      throw error;
    }
  }

  /**
   * Get all shared data visible to this plugin in a channel
   * Convenience method alias for readSharedChannel
   */
  async getSharedData(channel?: string): Promise<any> {
    const { pluginName } = this.context;
    
    if (!channel) {
      channel = 'default';
    }
    
    console.log(`[PluginSDK:${pluginName}] Getting shared data from channel: ${channel}`);
    
    try {
      const records = await this.readSharedChannel(channel);
      console.log(`[PluginSDK:${pluginName}] Found ${records.length} records in channel ${channel}`);
      
      const result: any = {};
      for (const record of records) {
        result[record.key] = record.value;
      }
      
      console.log(`[PluginSDK:${pluginName}] Shared data keys:`, Object.keys(result));
      return result;
    } catch (error) {
      console.error(`[PluginSDK:${pluginName}] Error getting shared data:`, error);
      throw error;
    }
  }

  /**
   * Read all shared data visible to this plugin in a channel
   */
  async readSharedChannel(channel: string): Promise<Array<{ ownerPlugin: string; key: string; value: any }>> {
    const { pluginName, convexClient } = this.context;

    console.log(`[PluginSDK:${pluginName}] readSharedChannel called for channel: "${channel}"`);

    try {
      const records = await (convexClient as any).query('pluginFramework:readSharedChannelData', {
        requesterPlugin: pluginName,
        channel,
      });

      console.log(`[PluginSDK:${pluginName}] Raw records from Convex:`, records.length, 'records');
      records.forEach((r: any, idx: number) => {
        console.log(`  [${idx}] owner: ${r.ownerPlugin}, channel: ${r.channel}, key: ${r.key}, visibility: ${r.visibility}`);
      });

      const mapped = records.map((record: any) => ({
        ownerPlugin: record.ownerPlugin,
        key: record.key,
        value: JSON.parse(record.value),
      }));

      console.log(`[PluginSDK:${pluginName}] Mapped ${mapped.length} records`);
      return mapped;
    } catch (error) {
      console.error(`[PluginSDK:${pluginName}] Error reading shared channel:`, error);
      return [];
    }
  }

  /**
   * Read one shared value from another plugin
   */
  async readSharedDataByKey(ownerPlugin: string, channel: string, key: string): Promise<any | null> {
    const { pluginName, convexClient } = this.context;

    const record = await convexClient.query('pluginFramework:readSharedDataByKey', {
      requesterPlugin: pluginName,
      ownerPlugin,
      channel,
      key,
    });

    if (!record) {
      return null;
    }

    try {
      return JSON.parse(record.value);
    } catch {
      return record.value;
    }
  }

  /**
   * Delete a shared key published by this plugin
   */
  async deleteSharedData(channel: string, key: string): Promise<boolean> {
    const { pluginName, convexClient } = this.context;

    return await convexClient.mutation('pluginFramework:deleteSharedData', {
      ownerPlugin: pluginName,
      channel,
      key,
    });
  }

  // ============================================================================
  // PLUGIN REDIRECT API
  // ============================================================================

  /**
   * Request dashboard navigation to another plugin and pass payload data.
   */
  redirectToPlugin(
    targetPlugin: string,
    payload?: any,
    options?: { trigger?: string }
  ): boolean {
    if (typeof window === 'undefined' || !targetPlugin) {
      return false;
    }

    const redirectPayload: PluginRedirectPayload = {
      fromPlugin: this.context.pluginName,
      targetPlugin,
      trigger: options?.trigger,
      payload,
      timestamp: Date.now(),
    };

    const win = window as unknown as Record<string, any>;
    const store = (win[PLUGIN_REDIRECT_STORE_KEY] ||= {});
    store[targetPlugin] = redirectPayload;

    window.dispatchEvent(new CustomEvent(PLUGIN_REDIRECT_EVENT, { detail: redirectPayload }));
    return true;
  }

  /**
   * Read redirect payload without removing it.
   */
  peekRedirectPayload(pluginName?: string): PluginRedirectPayload | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const target = pluginName || this.context.pluginName;
    const win = window as unknown as Record<string, any>;
    const store = win[PLUGIN_REDIRECT_STORE_KEY] || {};
    return store[target] || null;
  }

  /**
   * Read and clear redirect payload for the current plugin.
   */
  consumeRedirectPayload(pluginName?: string): PluginRedirectPayload | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const target = pluginName || this.context.pluginName;
    const win = window as unknown as Record<string, any>;
    const store = win[PLUGIN_REDIRECT_STORE_KEY] || {};
    const payload = store[target] || null;

    if (payload) {
      delete store[target];
    }

    return payload;
  }

  // ============================================================================
  // STREAMING & PROXY API
  // ============================================================================

  private getStreamFrameCache(): Record<string, string> {
    const win = window as unknown as Record<string, any>;
    if (!win[PLUGIN_STREAM_FRAME_CACHE_KEY]) {
      win[PLUGIN_STREAM_FRAME_CACHE_KEY] = {};
    }

    return win[PLUGIN_STREAM_FRAME_CACHE_KEY] as Record<string, string>;
  }

  private normalizeFrameData(frameData: string): string {
    const normalized = frameData.trim();

    if (
      normalized.startsWith('data:') ||
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('blob:')
    ) {
      return normalized;
    }

    if (normalized.startsWith('<svg')) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(normalized)}`;
    }

    if (/^[A-Za-z0-9+/=\r\n]+$/.test(normalized)) {
      const compact = normalized.replace(/\s+/g, '');
      if (compact.startsWith('/9j/')) {
        return `data:image/jpeg;base64,${compact}`;
      }
      if (compact.startsWith('iVBOR')) {
        return `data:image/png;base64,${compact}`;
      }
      if (compact.startsWith('R0lGOD')) {
        return `data:image/gif;base64,${compact}`;
      }
      if (compact.startsWith('UklGR')) {
        return `data:image/webp;base64,${compact}`;
      }
    }

    return normalized;
  }

  /**
   * Listen for frames from a specific stream (e.g., proxied RTSP)
   */
  onStreamFrame(streamId: string, callback: (frame: string) => void): () => void {
    const eventName = `stream:frame:${streamId}`;
    const frameCache = this.getStreamFrameCache();
    const handler = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        callback(e.detail);
      }
    };

    window.addEventListener(eventName, handler);
    const cachedFrame = frameCache[streamId];
    if (typeof cachedFrame === 'string' && cachedFrame.length > 0) {
      setTimeout(() => {
        callback(cachedFrame);
      }, 0);
    }
    this.log(`Started listening for frames on stream: ${streamId}`);

    return () => {
      window.removeEventListener(eventName, handler);
      this.log(`Stopped listening for frames on stream: ${streamId}`);
    };
  }

  /**
   * Emit a frame for a specific stream (can be called by a proxy handler)
   */
  emitStreamFrame(streamId: string, frameData: string): void {
    const eventName = `stream:frame:${streamId}`;
    const normalizedFrame = this.normalizeFrameData(frameData);
    this.getStreamFrameCache()[streamId] = normalizedFrame;
    window.dispatchEvent(new CustomEvent(eventName, { detail: normalizedFrame }));
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Get plugin context
   */
  getContext(): PluginContext {
    return this.context;
  }

  /**
   * Log message (useful for debugging)
   */
  log(...args: any[]): void {
    console.log(`[Plugin: ${this.context.pluginName}]`, ...args);
  }

  /**
   * Log error
   */
  error(...args: any[]): void {
    console.error(`[Plugin: ${this.context.pluginName}]`, ...args);
  }
}

/**
 * Create a plugin SDK instance
 */
export function createPluginSDK(context: PluginContext): PluginSDK {
  return new PluginSDK(context);
}

// Export types for TypeScript users
export type { PluginContext };
