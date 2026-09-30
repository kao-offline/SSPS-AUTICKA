import { pageRegistry, createPageComponent } from './page-registry';
import { AdminAccountManagementPage } from './admin-pages';
import { ApiKeysPage } from './api-keys-page';
import { PluginPublisherPage } from './plugin-publisher';
import { ServersPage } from './servers-page';
import { ServersMarketplacePage } from './servers-marketplace-page';
import { ServersPluginsPage } from './servers-plugins-page';

// Initialize default pages - these are now only used for emergency tools menu
// The actual plugins are loaded from Convex database
export function initializeDefaultPages() {
  // Create main navigation pages - none for now, only plugins
  const mainPages: never[] = [];

  // Create emergency-only pages (not added to main navigation)
  const emergencyPages = [
    createPageComponent('admin-accounts', 'Account Management', 'ðŸ‘¥', AdminAccountManagementPage, ['admin']),
    createPageComponent('admin-api-keys', 'API Keys', 'ðŸ”‘', ApiKeysPage, ['admin']),
    createPageComponent('admin-servers', 'Servers', 'ðŸ–¥ï¸', ServersPage, ['admin']),
    createPageComponent('admin-server-marketplace', 'Server Marketplace', 'ðŸ›’', ServersMarketplacePage, ['admin']),
    createPageComponent('admin-server-plugins', 'Server Plugins', 'ðŸ§©', ServersPluginsPage, ['admin']),
    createPageComponent('plugin-publisher', 'Plugin Publisher', 'ðŸ”Œ', PluginPublisherPage, ['admin']),
  ];

  // Register all pages
  [...mainPages, ...emergencyPages].forEach(page => {
    pageRegistry.registerPage(page);
  });
}

// Initialize all pages (call this in your app)
export function initializeAllPages() {
  initializeDefaultPages();
}
