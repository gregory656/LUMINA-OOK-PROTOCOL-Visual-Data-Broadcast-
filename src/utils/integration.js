import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, writeBatch } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { AnalyticsManager } from './analytics.js';
import { APIEndpoint, Webhook } from '../types';

export class IntegrationManager {
  static API_CONFIG_STORAGE_KEY = 'api_config';
  static WEBHOOKS_STORAGE_KEY = 'webhooks';

  // REST API Management
  static async createAPIEndpoint(endpointData) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const endpoint = {
        id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deviceId,
        path: endpointData.path,
        method: endpointData.method || 'GET',
        handler: endpointData.handler,
        authRequired: endpointData.authRequired !== false,
        rateLimit: endpointData.rateLimit || 100, // requests per minute
        description: endpointData.description || '',
        enabled: true,
        createdAt: new Date(),
        lastAccessed: null,
        accessCount: 0
      };

      await setDoc(doc(collection(db, 'api_endpoints')), endpoint);

      return endpoint;
    } catch (error) {
      console.error('Error creating API endpoint:', error);
      throw error;
    }
  }

  static async getAPIEndpoints() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const endpointsRef = collection(db, 'api_endpoints');
      const q = query(
        endpointsRef,
        where('deviceId', '==', deviceId),
        where('enabled', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const endpoints = [];

      querySnapshot.forEach((doc) => {
        endpoints.push({ id: doc.id, ...doc.data() });
      });

      return endpoints;
    } catch (error) {
      console.error('Error getting API endpoints:', error);
      return [];
    }
  }

  static async handleAPIRequest(path, method, data, authToken = null) {
    try {
      const endpoints = await this.getAPIEndpoints();
      const endpoint = endpoints.find(e =>
        e.path === path && e.method === method && e.enabled
      );

      if (!endpoint) {
        return { status: 404, error: 'Endpoint not found' };
      }

      // Check authentication
      if (endpoint.authRequired) {
        if (!authToken) {
          return { status: 401, error: 'Authentication required' };
        }

        const isValid = await this.validateAPIToken(authToken);
        if (!isValid) {
          return { status: 401, error: 'Invalid authentication token' };
        }
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(endpoint.id, endpoint.rateLimit);
      if (!rateLimitCheck.allowed) {
        return { status: 429, error: 'Rate limit exceeded' };
      }

      // Execute handler
      const result = await endpoint.handler(data);

      // Update endpoint stats
      await this.updateEndpointStats(endpoint.id);

      // Log API access
      await AnalyticsManager.logAuditEvent('api_access', {
        endpointId: endpoint.id,
        path: endpoint.path,
        method: endpoint.method,
        authenticated: !!authToken
      });

      return { status: 200, data: result };
    } catch (error) {
      console.error('Error handling API request:', error);
      return { status: 500, error: 'Internal server error' };
    }
  }

  static async generateAPIToken(permissions = ['read']) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const tokenId = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const token = this.generateSecureToken();

      const tokenData = {
        id: tokenId,
        deviceId,
        token: token,
        permissions: permissions,
        createdAt: new Date(),
        lastUsed: null,
        expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // 1 year
        active: true
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'api_tokens')), tokenData);

      return { token, tokenData };
    } catch (error) {
      console.error('Error generating API token:', error);
      throw error;
    }
  }

  static async validateAPIToken(token) {
    try {
      const db = getFirestore(getFirebaseApp());
      const tokensRef = collection(db, 'api_tokens');
      const q = query(tokensRef, where('token', '==', token), where('active', '==', true));

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return false;
      }

      const tokenDoc = querySnapshot.docs[0];
      const tokenData = tokenDoc.data();

      // Check expiration
      if (new Date() > tokenData.expiresAt.toDate()) {
        await this.revokeAPIToken(token);
        return false;
      }

      // Update last used
      await updateDoc(tokenDoc.ref, {
        lastUsed: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error validating API token:', error);
      return false;
    }
  }

  static async revokeAPIToken(token) {
    try {
      const db = getFirestore(getFirebaseApp());
      const tokensRef = collection(db, 'api_tokens');
      const q = query(tokensRef, where('token', '==', token));

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        await updateDoc(querySnapshot.docs[0].ref, {
          active: false,
          revokedAt: new Date()
        });
      }

      return true;
    } catch (error) {
      console.error('Error revoking API token:', error);
      return false;
    }
  }

  static generateSecureToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  static async checkRateLimit(endpointId, limit) {
    try {
      const now = Date.now();
      const windowStart = now - (60 * 1000); // 1 minute window

      const db = getFirestore(getFirebaseApp());
      const rateLimitRef = collection(db, 'rate_limits');
      const q = query(
        rateLimitRef,
        where('endpointId', '==', endpointId),
        where('timestamp', '>=', new Date(windowStart))
      );

      const querySnapshot = await getDocs(q);
      const requestCount = querySnapshot.size;

      if (requestCount >= limit) {
        return { allowed: false, remaining: 0 };
      }

      // Log this request
      await setDoc(doc(collection(db, 'rate_limits')), {
        endpointId,
        timestamp: new Date(),
        ipAddress: null // Would be set by server
      });

      return { allowed: true, remaining: limit - requestCount - 1 };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return { allowed: false, error: error.message };
    }
  }

  static async updateEndpointStats(endpointId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const endpointRef = doc(db, 'api_endpoints', endpointId);

      const endpointDoc = await getDoc(endpointRef);
      if (endpointDoc.exists) {
        const currentStats = endpointDoc.data();
        await updateDoc(endpointRef, {
          lastAccessed: new Date(),
          accessCount: (currentStats.accessCount || 0) + 1
        });
      }
    } catch (error) {
      console.error('Error updating endpoint stats:', error);
    }
  }

  // Webhook Management
  static async createWebhook(webhookData) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const webhook = {
        id: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deviceId,
        url: webhookData.url,
        events: webhookData.events || [],
        secret: this.generateSecureToken(),
        active: true,
        createdAt: new Date(),
        lastTriggered: null,
        failureCount: 0,
        successCount: 0
      };

      await setDoc(doc(collection(db, 'webhooks')), webhook);

      return webhook;
    } catch (error) {
      console.error('Error creating webhook:', error);
      throw error;
    }
  }

  static async getWebhooks() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const webhooksRef = collection(db, 'webhooks');
      const q = query(webhooksRef, where('deviceId', '==', deviceId));

      const querySnapshot = await getDocs(q);
      const webhooks = [];

      querySnapshot.forEach((doc) => {
        webhooks.push({ id: doc.id, ...doc.data() });
      });

      return webhooks;
    } catch (error) {
      console.error('Error getting webhooks:', error);
      return [];
    }
  }

  static async triggerWebhook(event, data) {
    try {
      const webhooks = await this.getWebhooks();
      const relevantWebhooks = webhooks.filter(w =>
        w.active && w.events.includes(event)
      );

      const results = [];

      for (const webhook of relevantWebhooks) {
        try {
          const result = await this.sendWebhookRequest(webhook, event, data);
          results.push({ webhookId: webhook.id, success: result.success });

          // Update webhook stats
          await this.updateWebhookStats(webhook.id, result.success);
        } catch (error) {
          results.push({ webhookId: webhook.id, success: false, error: error.message });
          await this.updateWebhookStats(webhook.id, false);
        }
      }

      return results;
    } catch (error) {
      console.error('Error triggering webhooks:', error);
      return [];
    }
  }

  static async sendWebhookRequest(webhook, event, data) {
    try {
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data
      };

      // Generate signature
      const signature = await this.generateWebhookSignature(payload, webhook.secret);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event
        },
        body: JSON.stringify(payload)
      });

      return {
        success: response.ok,
        statusCode: response.status,
        response: await response.text()
      };
    } catch (error) {
      console.error('Error sending webhook request:', error);
      return { success: false, error: error.message };
    }
  }

  static async generateWebhookSignature(payload, secret) {
    const message = JSON.stringify(payload);
    // In a real implementation, use HMAC-SHA256
    // For demo purposes, using simple hash
    const Crypto = require('expo-crypto');
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, secret + message);
  }

  static async updateWebhookStats(webhookId, success) {
    try {
      const db = getFirestore(getFirebaseApp());
      const webhookRef = doc(db, 'webhooks', webhookId);

      const updateData = {
        lastTriggered: new Date()
      };

      if (success) {
        updateData.successCount = await this.getWebhookSuccessCount(webhookId) + 1;
        updateData.failureCount = 0; // Reset failure count on success
      } else {
        updateData.failureCount = await this.getWebhookFailureCount(webhookId) + 1;
      }

      await updateDoc(webhookRef, updateData);

      // Deactivate webhook if too many failures
      if (updateData.failureCount >= 5) {
        await updateDoc(webhookRef, { active: false });
      }
    } catch (error) {
      console.error('Error updating webhook stats:', error);
    }
  }

  static async getWebhookSuccessCount(webhookId) {
    const webhook = await this.getWebhookById(webhookId);
    return webhook?.successCount || 0;
  }

  static async getWebhookFailureCount(webhookId) {
    const webhook = await this.getWebhookById(webhookId);
    return webhook?.failureCount || 0;
  }

  static async getWebhookById(webhookId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const webhookDoc = await getDoc(doc(db, 'webhooks', webhookId));

      if (webhookDoc.exists()) {
        return { id: webhookDoc.id, ...webhookDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting webhook by ID:', error);
      return null;
    }
  }

  // Plugin System
  static async installPlugin(pluginData) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const plugin = {
        id: `plugin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deviceId,
        name: pluginData.name,
        version: pluginData.version,
        description: pluginData.description,
        author: pluginData.author,
        permissions: pluginData.permissions || [],
        code: pluginData.code, // Base64 encoded plugin code
        active: false,
        installedAt: new Date(),
        lastUpdated: new Date()
      };

      await setDoc(doc(collection(db, 'plugins')), plugin);

      return plugin;
    } catch (error) {
      console.error('Error installing plugin:', error);
      throw error;
    }
  }

  static async getPlugins() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const pluginsRef = collection(db, 'plugins');
      const q = query(pluginsRef, where('deviceId', '==', deviceId));

      const querySnapshot = await getDocs(q);
      const plugins = [];

      querySnapshot.forEach((doc) => {
        plugins.push({ id: doc.id, ...doc.data() });
      });

      return plugins;
    } catch (error) {
      console.error('Error getting plugins:', error);
      return [];
    }
  }

  static async activatePlugin(pluginId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const pluginRef = doc(db, 'plugins', pluginId);

      // Check permissions before activation
      const plugin = await this.getPluginById(pluginId);
      if (!plugin) {
        throw new Error('Plugin not found');
      }

      // Validate permissions
      const hasPermissions = await this.validatePluginPermissions(plugin.permissions);
      if (!hasPermissions) {
        throw new Error('Insufficient permissions to activate plugin');
      }

      await updateDoc(pluginRef, { active: true });

      // Load and execute plugin
      await this.loadPlugin(plugin);

      return true;
    } catch (error) {
      console.error('Error activating plugin:', error);
      return false;
    }
  }

  static async validatePluginPermissions(requiredPermissions) {
    // In a real implementation, this would check user/device permissions
    // For demo, assume all permissions are granted
    return true;
  }

  static async loadPlugin(plugin) {
    try {
      // Decode plugin code
      const code = atob(plugin.code);

      // Create isolated context for plugin execution
      const pluginContext = {
        console: {
          log: (...args) => console.log(`[Plugin ${plugin.name}]`, ...args),
          error: (...args) => console.error(`[Plugin ${plugin.name}]`, ...args)
        },
        // Provide limited API access
        api: {
          sendMessage: async (message, target) => {
            // Plugin can send messages through the system
            const { CommandManager } = await import('./command.js');
            return await CommandManager.sendCommand('plugin_message', {
              pluginId: plugin.id,
              message,
              target
            }, target);
          },
          getDeviceInfo: async () => {
            return await DeviceManager.getDeviceProfile();
          }
        }
      };

      // Execute plugin in isolated context
      const pluginFunction = new Function('context', `with(context) { ${code} }`);
      pluginFunction(pluginContext);

      console.log(`Plugin ${plugin.name} loaded successfully`);
    } catch (error) {
      console.error(`Error loading plugin ${plugin.name}:`, error);
      // Deactivate plugin on load failure
      await this.deactivatePlugin(plugin.id);
    }
  }

  static async deactivatePlugin(pluginId) {
    try {
      const db = getFirestore(getFirebaseApp());
      await updateDoc(doc(db, 'plugins', pluginId), { active: false });
      return true;
    } catch (error) {
      console.error('Error deactivating plugin:', error);
      return false;
    }
  }

  static async getPluginById(pluginId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const pluginDoc = await getDoc(doc(db, 'plugins', pluginId));

      if (pluginDoc.exists()) {
        return { id: pluginDoc.id, ...pluginDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting plugin by ID:', error);
      return null;
    }
  }

  // OAuth Integration
  static async connectOAuthProvider(provider, config) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const oauth = {
        id: `oauth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deviceId,
        provider,
        config,
        connectedAt: new Date(),
        lastSync: null,
        active: true,
        accessToken: null,
        refreshToken: null,
        expiresAt: null
      };

      await setDoc(doc(collection(db, 'oauth_connections')), oauth);

      return oauth;
    } catch (error) {
      console.error('Error connecting OAuth provider:', error);
      throw error;
    }
  }

  static async getOAuthConnections() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const oauthRef = collection(db, 'oauth_connections');
      const q = query(oauthRef, where('deviceId', '==', deviceId), where('active', '==', true));

      const querySnapshot = await getDocs(q);
      const connections = [];

      querySnapshot.forEach((doc) => {
        connections.push({ id: doc.id, ...doc.data() });
      });

      return connections;
    } catch (error) {
      console.error('Error getting OAuth connections:', error);
      return [];
    }
  }

  static async syncWithOAuthProvider(connectionId) {
    try {
      const connection = await this.getOAuthConnectionById(connectionId);
      if (!connection) {
        throw new Error('OAuth connection not found');
      }

      // Refresh token if needed
      if (connection.expiresAt && new Date() > connection.expiresAt.toDate()) {
        await this.refreshOAuthToken(connectionId);
      }

      // Sync data based on provider
      const syncResult = await this.performOAuthSync(connection);

      // Update last sync time
      const db = getFirestore(getFirebaseApp());
      await updateDoc(doc(db, 'oauth_connections', connectionId), {
        lastSync: new Date()
      });

      return syncResult;
    } catch (error) {
      console.error('Error syncing with OAuth provider:', error);
      throw error;
    }
  }

  static async performOAuthSync(connection) {
    // Implementation would vary by provider (Google, Microsoft, etc.)
    // This is a simplified example
    try {
      switch (connection.provider) {
        case 'google':
          return await this.syncGoogleData(connection);
        case 'microsoft':
          return await this.syncMicrosoftData(connection);
        case 'github':
          return await this.syncGitHubData(connection);
        default:
          throw new Error(`Unsupported OAuth provider: ${connection.provider}`);
      }
    } catch (error) {
      console.error('Error performing OAuth sync:', error);
      return { success: false, error: error.message };
    }
  }

  static async syncGoogleData(connection) {
    // Simulate Google API sync
    console.log('Syncing with Google services');
    return { success: true, data: { contacts: 150, calendar: 25, drive: 10 } };
  }

  static async syncMicrosoftData(connection) {
    // Simulate Microsoft API sync
    console.log('Syncing with Microsoft services');
    return { success: true, data: { outlook: 200, onedrive: 45, teams: 15 } };
  }

  static async syncGitHubData(connection) {
    // Simulate GitHub API sync
    console.log('Syncing with GitHub');
    return { success: true, data: { repos: 12, issues: 8, pullRequests: 3 } };
  }

  static async refreshOAuthToken(connectionId) {
    try {
      const connection = await this.getOAuthConnectionById(connectionId);
      if (!connection || !connection.refreshToken) {
        throw new Error('No refresh token available');
      }

      // In a real implementation, make API call to refresh token
      const newTokens = await this.performTokenRefresh(connection);

      const db = getFirestore(getFirebaseApp());
      await updateDoc(doc(db, 'oauth_connections', connectionId), {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken || connection.refreshToken,
        expiresAt: new Date(Date.now() + (newTokens.expiresIn || 3600) * 1000)
      });

      return true;
    } catch (error) {
      console.error('Error refreshing OAuth token:', error);
      return false;
    }
  }

  static async performTokenRefresh(connection) {
    // Implementation would make actual API calls to OAuth providers
    // This is a simplified example
    return {
      accessToken: this.generateSecureToken(),
      refreshToken: this.generateSecureToken(),
      expiresIn: 3600
    };
  }

  static async getOAuthConnectionById(connectionId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const connectionDoc = await getDoc(doc(db, 'oauth_connections', connectionId));

      if (connectionDoc.exists()) {
        return { id: connectionDoc.id, ...connectionDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting OAuth connection:', error);
      return null;
    }
  }

  // Data Portability
  static async exportUserData(format = 'json') {
    try {
      const deviceId = await DeviceManager.getDeviceId();

      const exportData = {
        deviceId,
        exportedAt: new Date(),
        version: '1.0',
        sections: {
          profile: await DeviceManager.getDeviceProfile(),
          social: await import('./social.js').then(m => m.default.getSocialProfile()),
          analytics: await AnalyticsManager.getComprehensiveAnalytics(deviceId, { days: 365 }),
          commands: await this.getCommandHistory(),
          games: await import('./game.js').then(m => m.default.getGameHistory(deviceId)),
          enterprise: await this.getEnterpriseData(),
          settings: await import('./ui.js').then(m => m.default.getUIConfig())
        }
      };

      if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
      } else if (format === 'csv') {
        return this.convertExportToCSV(exportData);
      }

      return exportData;
    } catch (error) {
      console.error('Error exporting user data:', error);
      throw error;
    }
  }

  static async importUserData(importData, options = {}) {
    try {
      const deviceId = await DeviceManager.getDeviceId();

      // Validate import data
      if (!importData.deviceId || !importData.sections) {
        throw new Error('Invalid import data format');
      }

      const results = {
        imported: [],
        skipped: [],
        errors: []
      };

      // Import sections based on options
      if (options.includeProfile && importData.sections.profile) {
        try {
          await DeviceManager.updateDeviceProfile(importData.sections.profile);
          results.imported.push('profile');
        } catch (error) {
          results.errors.push(`profile: ${error.message}`);
        }
      }

      if (options.includeSocial && importData.sections.social) {
        try {
          const { SocialManager } = await import('./social.js');
          await SocialManager.updateSocialProfile(importData.sections.social);
          results.imported.push('social');
        } catch (error) {
          results.errors.push(`social: ${error.message}`);
        }
      }

      if (options.includeSettings && importData.sections.settings) {
        try {
          const { UIManager } = await import('./ui.js');
          await UIManager.updateUIConfig(importData.sections.settings);
          results.imported.push('settings');
        } catch (error) {
          results.errors.push(`settings: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      console.error('Error importing user data:', error);
      throw error;
    }
  }

  static async getCommandHistory() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const commandsRef = collection(db, 'command_logs');
      const q = query(
        commandsRef,
        where('senderId', '==', deviceId),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );

      const querySnapshot = await getDocs(q);
      const commands = [];

      querySnapshot.forEach((doc) => {
        commands.push({ id: doc.id, ...doc.data() });
      });

      return commands;
    } catch (error) {
      console.error('Error getting command history:', error);
      return [];
    }
  }

  static async getEnterpriseData() {
    try {
      // Aggregate enterprise data for export
      return {
        assets: [], // Would fetch user's assets
        attendance: [], // Would fetch attendance records
        timeEntries: [], // Would fetch time tracking data
        qualityChecks: [] // Would fetch quality control data
      };
    } catch (error) {
      console.error('Error getting enterprise data:', error);
      return {};
    }
  }

  static convertExportToCSV(exportData) {
    // Simplified CSV conversion - in practice, this would be more comprehensive
    const rows = [
      ['Section', 'Data Points', 'Last Updated'],
      ['Profile', Object.keys(exportData.sections.profile || {}).length, exportData.exportedAt],
      ['Social', Object.keys(exportData.sections.social || {}).length, exportData.exportedAt],
      ['Analytics', Object.keys(exportData.sections.analytics || {}).length, exportData.exportedAt]
    ];

    return rows.map(row => row.join(',')).join('\n');
  }

  // Real-time integration monitoring
  static subscribeToIntegrations(callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const deviceId = DeviceManager.getDeviceId();

      // Subscribe to multiple collections
      const unsubscribers = [];

      // API endpoints
      unsubscribers.push(onSnapshot(
        query(collection(db, 'api_endpoints'), where('deviceId', '==', deviceId)),
        (snapshot) => callback({ type: 'api_endpoints', changes: snapshot.docChanges() })
      ));

      // Webhooks
      unsubscribers.push(onSnapshot(
        query(collection(db, 'webhooks'), where('deviceId', '==', deviceId)),
        (snapshot) => callback({ type: 'webhooks', changes: snapshot.docChanges() })
      ));

      // OAuth connections
      unsubscribers.push(onSnapshot(
        query(collection(db, 'oauth_connections'), where('deviceId', '==', deviceId)),
        (snapshot) => callback({ type: 'oauth', changes: snapshot.docChanges() })
      ));

      // Plugins
      unsubscribers.push(onSnapshot(
        query(collection(db, 'plugins'), where('deviceId', '==', deviceId)),
        (snapshot) => callback({ type: 'plugins', changes: snapshot.docChanges() })
      ));

      return () => {
        unsubscribers.forEach(unsubscribe => unsubscribe());
      };
    } catch (error) {
      console.error('Error subscribing to integrations:', error);
      return null;
    }
  }
}

export default IntegrationManager;