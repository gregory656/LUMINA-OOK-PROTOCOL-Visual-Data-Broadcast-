import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, writeBatch } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { SessionManager } from './session.js';
import { CommandManager } from './command.js';
import { MeshNetwork, NetworkRoute, QueuedMessage } from '../types';

export class MeshManager {
  static NETWORK_STORAGE_KEY = 'mesh_networks';
  static ROUTES_STORAGE_KEY = 'network_routes';

  // Network management
  static async createMeshNetwork(networkName, maxDevices = 50) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const networkId = `mesh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const network = {
        id: networkId,
        name: networkName,
        devices: [deviceId],
        routes: [],
        messageQueue: [],
        status: 'active',
        maxDevices,
        createdBy: deviceId,
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'mesh_networks', networkId), network);

      // Store locally
      await this.storeNetworkLocally(network);

      return network;
    } catch (error) {
      console.error('Error creating mesh network:', error);
      throw error;
    }
  }

  static async joinMeshNetwork(networkId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const networkRef = doc(db, 'mesh_networks', networkId);
      const networkDoc = await getDoc(networkRef);

      if (!networkDoc.exists()) {
        throw new Error('Mesh network not found');
      }

      const network = { id: networkDoc.id, ...networkDoc.data() };

      if (network.devices.length >= network.maxDevices) {
        throw new Error('Network is full');
      }

      if (network.devices.includes(deviceId)) {
        throw new Error('Already joined this network');
      }

      // Add device to network
      await updateDoc(networkRef, {
        devices: [...network.devices, deviceId],
        lastUpdated: new Date()
      });

      // Discover and update routes
      await this.discoverNetworkRoutes(networkId);

      return { ...network, devices: [...network.devices, deviceId] };
    } catch (error) {
      console.error('Error joining mesh network:', error);
      throw error;
    }
  }

  static async leaveMeshNetwork(networkId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const networkRef = doc(db, 'mesh_networks', networkId);
      const networkDoc = await getDoc(networkRef);

      if (!networkDoc.exists()) {
        throw new Error('Mesh network not found');
      }

      const network = { id: networkDoc.id, ...networkDoc.data() };

      if (!network.devices.includes(deviceId)) {
        throw new Error('Not a member of this network');
      }

      // Remove device from network
      const updatedDevices = network.devices.filter(id => id !== deviceId);
      await updateDoc(networkRef, {
        devices: updatedDevices,
        lastUpdated: new Date()
      });

      // Clean up routes
      await this.cleanupRoutesForDevice(networkId, deviceId);

      // Remove local storage
      await this.removeNetworkLocally(networkId);

      return true;
    } catch (error) {
      console.error('Error leaving mesh network:', error);
      return false;
    }
  }

  // Route discovery and optimization
  static async discoverNetworkRoutes(networkId) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const network = await this.getMeshNetwork(networkId);

      if (!network) return;

      const routes = [];

      // For each device in network, calculate routes
      for (const targetDevice of network.devices) {
        if (targetDevice === deviceId) continue;

        // Check direct connection first
        const hasDirectConnection = await SessionManager.areDevicesPaired(deviceId, targetDevice);
        if (hasDirectConnection) {
          routes.push({
            from: deviceId,
            to: targetDevice,
            via: [],
            quality: 1.0, // Direct connection
            lastUsed: new Date()
          });
        } else {
          // Find multi-hop routes
          const multiHopRoute = await this.findMultiHopRoute(networkId, deviceId, targetDevice);
          if (multiHopRoute) {
            routes.push(multiHopRoute);
          }
        }
      }

      // Update routes in database
      const db = getFirestore(getFirebaseApp());
      const networkRef = doc(db, 'mesh_networks', networkId);

      await updateDoc(networkRef, {
        routes: routes,
        lastUpdated: new Date()
      });

      // Store routes locally
      await this.storeRoutesLocally(networkId, routes);

      return routes;
    } catch (error) {
      console.error('Error discovering network routes:', error);
      return [];
    }
  }

  static async findMultiHopRoute(networkId, fromDevice, toDevice, maxHops = 3) {
    try {
      const network = await this.getMeshNetwork(networkId);
      if (!network) return null;

      // Simple breadth-first search for multi-hop routes
      const visited = new Set();
      const queue = [{ device: fromDevice, path: [], quality: 1.0 }];

      while (queue.length > 0) {
        const current = queue.shift();

        if (current.path.length > maxHops) continue;
        if (visited.has(current.device)) continue;

        visited.add(current.device);

        // Check if we reached target
        if (current.device === toDevice && current.path.length > 0) {
          return {
            from: fromDevice,
            to: toDevice,
            via: current.path,
            quality: current.quality / (current.path.length + 1), // Decrease quality with more hops
            lastUsed: new Date()
          };
        }

        // Find connected devices
        for (const device of network.devices) {
          if (device !== current.device && !visited.has(device)) {
            const hasConnection = await SessionManager.areDevicesPaired(current.device, device);
            if (hasConnection) {
              queue.push({
                device: device,
                path: [...current.path, current.device],
                quality: current.quality * 0.9 // Slight quality degradation per hop
              });
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding multi-hop route:', error);
      return null;
    }
  }

  // Message routing
  static async routeMessage(networkId, targetDevice, message, priority = 'normal') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const network = await this.getMeshNetwork(networkId);

      if (!network || !network.devices.includes(targetDevice)) {
        throw new Error('Target device not in network');
      }

      // Check if target is directly reachable
      const directRoute = network.routes.find(r =>
        r.from === deviceId && r.to === targetDevice && r.via.length === 0
      );

      if (directRoute) {
        // Send directly
        return await CommandManager.sendCommand(message.type, message.payload, targetDevice);
      }

      // Find multi-hop route
      const multiHopRoute = network.routes.find(r =>
        r.from === deviceId && r.to === targetDevice && r.via.length > 0
      );

      if (multiHopRoute) {
        // Queue message for multi-hop routing
        await this.queueMessageForRouting(networkId, multiHopRoute, message, priority);
        return { queued: true, route: multiHopRoute };
      }

      // Queue message for later delivery
      await this.queueMessageForOfflineDelivery(networkId, targetDevice, message, priority);
      return { queued: true, offline: true };
    } catch (error) {
      console.error('Error routing message:', error);
      throw error;
    }
  }

  static async queueMessageForRouting(networkId, route, message, priority) {
    try {
      const queuedMessage = {
        id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: route.from,
        to: route.to,
        type: message.type,
        payload: message.payload,
        priority,
        route: route,
        createdAt: new Date(),
        status: 'queued'
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'queued_messages')), queuedMessage);

      // Add to network message queue
      const networkRef = doc(db, 'mesh_networks', networkId);
      await updateDoc(networkRef, {
        messageQueue: [...(await this.getNetworkMessageQueue(networkId)), queuedMessage.id],
        lastUpdated: new Date()
      });

      return queuedMessage;
    } catch (error) {
      console.error('Error queuing message for routing:', error);
      throw error;
    }
  }

  static async queueMessageForOfflineDelivery(networkId, targetDevice, message, priority) {
    try {
      const queuedMessage = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: await DeviceManager.getDeviceId(),
        to: targetDevice,
        type: message.type,
        payload: message.payload,
        priority,
        createdAt: new Date(),
        status: 'offline',
        networkId
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'offline_messages')), queuedMessage);

      return queuedMessage;
    } catch (error) {
      console.error('Error queuing message for offline delivery:', error);
      throw error;
    }
  }

  static async processMessageQueue(networkId) {
    try {
      const queue = await this.getNetworkMessageQueue(networkId);
      const processed = [];

      for (const messageId of queue) {
        const message = await this.getQueuedMessage(messageId);
        if (!message) continue;

        // Try to deliver message
        try {
          const result = await this.deliverQueuedMessage(message);
          if (result.delivered) {
            await this.removeFromMessageQueue(networkId, messageId);
            processed.push({ messageId, status: 'delivered' });
          } else {
            processed.push({ messageId, status: 'failed', error: result.error });
          }
        } catch (error) {
          processed.push({ messageId, status: 'error', error: error.message });
        }
      }

      return processed;
    } catch (error) {
      console.error('Error processing message queue:', error);
      return [];
    }
  }

  static async deliverQueuedMessage(queuedMessage) {
    try {
      // Check if target device is now reachable
      const isReachable = await SessionManager.areDevicesPaired(queuedMessage.from, queuedMessage.to);

      if (isReachable) {
        await CommandManager.sendCommand(queuedMessage.type, queuedMessage.payload, queuedMessage.to);

        // Update message status
        const db = getFirestore(getFirebaseApp());
        await updateDoc(doc(db, 'queued_messages', queuedMessage.id), {
          status: 'delivered',
          deliveredAt: new Date()
        });

        return { delivered: true };
      }

      return { delivered: false, error: 'Device not reachable' };
    } catch (error) {
      console.error('Error delivering queued message:', error);
      return { delivered: false, error: error.message };
    }
  }

  // Network health monitoring
  static async monitorNetworkHealth(networkId) {
    try {
      const network = await this.getMeshNetwork(networkId);
      if (!network) return null;

      const health = {
        networkId,
        totalDevices: network.devices.length,
        activeDevices: 0,
        totalRoutes: network.routes.length,
        activeRoutes: 0,
        queuedMessages: network.messageQueue.length,
        averageRouteQuality: 0,
        connectivityMatrix: {},
        lastChecked: new Date()
      };

      // Check device connectivity
      for (const device of network.devices) {
        const isActive = await this.checkDeviceConnectivity(device);
        if (isActive) health.activeDevices++;

        health.connectivityMatrix[device] = {};
        for (const otherDevice of network.devices) {
          if (device !== otherDevice) {
            const isConnected = await SessionManager.areDevicesPaired(device, otherDevice);
            health.connectivityMatrix[device][otherDevice] = isConnected;
          }
        }
      }

      // Check route quality
      let totalQuality = 0;
      for (const route of network.routes) {
        if (route.quality > 0.5) health.activeRoutes++; // Consider routes with >50% quality as active
        totalQuality += route.quality;
      }

      health.averageRouteQuality = network.routes.length > 0 ? totalQuality / network.routes.length : 0;

      // Store health data
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'network_health')), {
        ...health,
        timestamp: new Date()
      });

      return health;
    } catch (error) {
      console.error('Error monitoring network health:', error);
      return null;
    }
  }

  static async checkDeviceConnectivity(deviceId) {
    try {
      // Check if device has been active recently (within 5 minutes)
      const profile = await DeviceManager.getDeviceProfile(deviceId);
      if (!profile) return false;

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return profile.lastSeen > fiveMinutesAgo;
    } catch (error) {
      console.error('Error checking device connectivity:', error);
      return false;
    }
  }

  // Network optimization
  static async optimizeNetworkRoutes(networkId) {
    try {
      const network = await this.getMeshNetwork(networkId);
      if (!network) return;

      const optimizations = {
        removedRoutes: 0,
        addedRoutes: 0,
        improvedQuality: 0,
        timestamp: new Date()
      };

      // Remove stale routes (older than 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const activeRoutes = network.routes.filter(route => route.lastUsed > oneHourAgo);

      optimizations.removedRoutes = network.routes.length - activeRoutes.length;

      // Discover new routes
      const newRoutes = await this.discoverNetworkRoutes(networkId);
      optimizations.addedRoutes = newRoutes.length - activeRoutes.length;

      // Update network with optimized routes
      const db = getFirestore(getFirebaseApp());
      await updateDoc(doc(db, 'mesh_networks', networkId), {
        routes: newRoutes,
        lastOptimized: new Date(),
        lastUpdated: new Date()
      });

      // Log optimization
      await setDoc(doc(collection(db, 'network_optimizations')), {
        networkId,
        ...optimizations
      });

      return optimizations;
    } catch (error) {
      console.error('Error optimizing network routes:', error);
      return null;
    }
  }

  // Helper methods
  static async getMeshNetwork(networkId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const networkDoc = await getDoc(doc(db, 'mesh_networks', networkId));

      if (networkDoc.exists()) {
        return { id: networkDoc.id, ...networkDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting mesh network:', error);
      return null;
    }
  }

  static async getNetworkMessageQueue(networkId) {
    try {
      const network = await this.getMeshNetwork(networkId);
      return network?.messageQueue || [];
    } catch (error) {
      console.error('Error getting network message queue:', error);
      return [];
    }
  }

  static async getQueuedMessage(messageId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const messageDoc = await getDoc(doc(db, 'queued_messages', messageId));

      if (messageDoc.exists()) {
        return { id: messageDoc.id, ...messageDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting queued message:', error);
      return null;
    }
  }

  static async removeFromMessageQueue(networkId, messageId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const networkRef = doc(db, 'mesh_networks', networkId);
      const network = await this.getMeshNetwork(networkId);

      if (network) {
        const updatedQueue = network.messageQueue.filter(id => id !== messageId);
        await updateDoc(networkRef, {
          messageQueue: updatedQueue,
          lastUpdated: new Date()
        });
      }

      return true;
    } catch (error) {
      console.error('Error removing from message queue:', error);
      return false;
    }
  }

  static async cleanupRoutesForDevice(networkId, deviceId) {
    try {
      const network = await this.getMeshNetwork(networkId);
      if (!network) return;

      const updatedRoutes = network.routes.filter(route =>
        route.from !== deviceId && route.to !== deviceId &&
        !route.via.includes(deviceId)
      );

      const db = getFirestore(getFirebaseApp());
      await updateDoc(doc(db, 'mesh_networks', networkId), {
        routes: updatedRoutes,
        lastUpdated: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error cleaning up routes for device:', error);
      return false;
    }
  }

  // Local storage helpers
  static async storeNetworkLocally(network) {
    try {
      const stored = await AsyncStorage.getItem(this.NETWORK_STORAGE_KEY);
      const networks = stored ? JSON.parse(stored) : {};

      networks[network.id] = network;
      await AsyncStorage.setItem(this.NETWORK_STORAGE_KEY, JSON.stringify(networks));
    } catch (error) {
      console.error('Error storing network locally:', error);
    }
  }

  static async removeNetworkLocally(networkId) {
    try {
      const stored = await AsyncStorage.getItem(this.NETWORK_STORAGE_KEY);
      if (stored) {
        const networks = JSON.parse(stored);
        delete networks[networkId];
        await AsyncStorage.setItem(this.NETWORK_STORAGE_KEY, JSON.stringify(networks));
      }
    } catch (error) {
      console.error('Error removing network locally:', error);
    }
  }

  static async storeRoutesLocally(networkId, routes) {
    try {
      const stored = await AsyncStorage.getItem(this.ROUTES_STORAGE_KEY);
      const allRoutes = stored ? JSON.parse(stored) : {};

      allRoutes[networkId] = routes;
      await AsyncStorage.setItem(this.ROUTES_STORAGE_KEY, JSON.stringify(allRoutes));
    } catch (error) {
      console.error('Error storing routes locally:', error);
    }
  }

  // Real-time network monitoring
  static subscribeToNetworkUpdates(networkId, callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const networkRef = doc(db, 'mesh_networks', networkId);

      return onSnapshot(networkRef, (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      });
    } catch (error) {
      console.error('Error subscribing to network updates:', error);
      return null;
    }
  }

  static subscribeToMessageQueueUpdates(networkId, callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const queueRef = collection(db, 'queued_messages');
      const q = query(queueRef, where('networkId', '==', networkId));

      return onSnapshot(q, (snapshot) => {
        const changes = [];
        snapshot.docChanges().forEach((change) => {
          changes.push({
            type: change.type,
            message: { id: change.doc.id, ...change.doc.data() }
          });
        });
        callback(changes);
      });
    } catch (error) {
      console.error('Error subscribing to message queue updates:', error);
      return null;
    }
  }
}

export default MeshManager;