import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceManager from './device.js';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, addDoc } from 'firebase/firestore';
import CryptoJS from 'crypto-js';

export class PairingManager {
  static PAIRED_DEVICES_KEY = 'paired_devices';
  static PAIRING_TOKEN_KEY = 'pairing_token';

  // Get Firestore instance
  static getDB() {
    // This will be initialized by DeviceManager
    const { getFirestoreDB } = require('./device.js');
    return getFirestoreDB();
  }

  // Request pairing token from backend
  static async requestPairingToken(receiverDeviceId, backendUrl = 'http://localhost:3000') {
    try {
      const senderDeviceId = await DeviceManager.getDeviceId();

      const response = await fetch(`${backendUrl}/auth/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderDeviceId,
          receiverDeviceId
        })
      });

      const result = await response.json();

      if (result.success) {
        // Store token temporarily
        await AsyncStorage.setItem(this.PAIRING_TOKEN_KEY, JSON.stringify({
          token: result.token,
          expiresAt: result.expiresAt,
          senderDeviceId,
          receiverDeviceId
        }));

        return {
          success: true,
          token: result.token,
          expiresAt: result.expiresAt
        };
      } else {
        return { success: false, message: result.message };
      }
    } catch (error) {
      console.error('Error requesting pairing token:', error);
      return { success: false, message: error.message };
    }
  }

  // Verify pairing token (called after VLC reception)
  static async verifyPairingToken(token, backendUrl = 'http://localhost:3000') {
    try {
      const response = await fetch(`${backendUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      if (result.success) {
        // Store pairing relationship
        await this.storePairing(result.senderDeviceId, result.receiverDeviceId);
        await this.logPairingEvent('pairing_established', {
          senderDeviceId: result.senderDeviceId,
          receiverDeviceId: result.receiverDeviceId
        });

        // Clear used token
        await AsyncStorage.removeItem(this.PAIRING_TOKEN_KEY);

        return { success: true };
      } else {
        return { success: false, message: result.message };
      }
    } catch (error) {
      console.error('Error verifying pairing token:', error);
      return { success: false, message: error.message };
    }
  }

  // Store pairing relationship locally and in Firestore
  static async storePairing(senderDeviceId, receiverDeviceId) {
    try {
      const currentDeviceId = await DeviceManager.getDeviceId();
      const db = this.getDB();

      // Determine which device is "this" device
      const isSender = currentDeviceId === senderDeviceId;
      const pairedDeviceId = isSender ? receiverDeviceId : senderDeviceId;

      // Store locally
      const pairedDevices = await this.getPairedDevices();
      if (!pairedDevices.includes(pairedDeviceId)) {
        pairedDevices.push(pairedDeviceId);
        await AsyncStorage.setItem(this.PAIRED_DEVICES_KEY, JSON.stringify(pairedDevices));
      }

      // Store in Firestore
      const pairingId = [senderDeviceId, receiverDeviceId].sort().join('_');
      const pairingData = {
        id: pairingId,
        devices: [senderDeviceId, receiverDeviceId],
        establishedAt: new Date(),
        status: 'active',
        lastActivity: new Date()
      };

      await setDoc(doc(db, 'pairings', pairingId), pairingData);

      console.log('Pairing stored successfully');
      return true;
    } catch (error) {
      console.error('Error storing pairing:', error);
      return false;
    }
  }

  // Get paired devices
  static async getPairedDevices() {
    try {
      const data = await AsyncStorage.getItem(this.PAIRED_DEVICES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting paired devices:', error);
      return [];
    }
  }

  // Check if devices are paired
  static async areDevicesPaired(deviceId1, deviceId2) {
    try {
      const db = this.getDB();
      const pairingId = [deviceId1, deviceId2].sort().join('_');
      const pairingDoc = await getDoc(doc(db, 'pairings', pairingId));

      return pairingDoc.exists() && pairingDoc.data().status === 'active';
    } catch (error) {
      console.error('Error checking pairing status:', error);
      return false;
    }
  }

  // Revoke pairing
  static async revokePairing(pairedDeviceId) {
    try {
      const currentDeviceId = await DeviceManager.getDeviceId();
      const db = this.getDB();

      // Remove locally
      const pairedDevices = await this.getPairedDevices();
      const updatedDevices = pairedDevices.filter(id => id !== pairedDeviceId);
      await AsyncStorage.setItem(this.PAIRED_DEVICES_KEY, JSON.stringify(updatedDevices));

      // Update in Firestore
      const pairingId = [currentDeviceId, pairedDeviceId].sort().join('_');
      await setDoc(doc(db, 'pairings', pairingId), {
        status: 'revoked',
        revokedAt: new Date()
      }, { merge: true });

      await this.logPairingEvent('pairing_revoked', {
        deviceId1: currentDeviceId,
        deviceId2: pairedDeviceId
      });

      console.log('Pairing revoked successfully');
      return true;
    } catch (error) {
      console.error('Error revoking pairing:', error);
      return false;
    }
  }

  // Create signed command
  static async createSignedCommand(receiverId, command, expiresInMinutes = 5) {
    try {
      const senderId = await DeviceManager.getDeviceId();

      // Check if paired
      if (!(await this.areDevicesPaired(senderId, receiverId))) {
        throw new Error('Devices are not paired');
      }

      const nonce = CryptoJS.lib.WordArray.random(16).toString();
      const expiresAt = Date.now() + (expiresInMinutes * 60 * 1000);

      const commandData = {
        type: "COMMAND",
        senderId,
        receiverId,
        command,
        nonce,
        expiresAt
      };

      // Create signature using device ID as key (in production, use proper key management)
      const signature = CryptoJS.HmacSHA256(JSON.stringify(commandData), senderId).toString();

      const signedCommand = {
        ...commandData,
        signature
      };

      return signedCommand;
    } catch (error) {
      console.error('Error creating signed command:', error);
      throw error;
    }
  }

  // Verify and execute command
  static async verifyAndExecuteCommand(signedCommand) {
    try {
      const currentDeviceId = await DeviceManager.getDeviceId();

      // Check if this device is the intended receiver
      if (signedCommand.receiverId !== currentDeviceId) {
        throw new Error('Command not intended for this device');
      }

      // Check expiration
      if (Date.now() > signedCommand.expiresAt) {
        throw new Error('Command expired');
      }

      // Check pairing
      if (!(await this.areDevicesPaired(signedCommand.senderId, signedCommand.receiverId))) {
        throw new Error('Devices are not paired');
      }

      // Verify signature
      const commandData = {
        type: signedCommand.type,
        senderId: signedCommand.senderId,
        receiverId: signedCommand.receiverId,
        command: signedCommand.command,
        nonce: signedCommand.nonce,
        expiresAt: signedCommand.expiresAt
      };

      const expectedSignature = CryptoJS.HmacSHA256(JSON.stringify(commandData), signedCommand.senderId).toString();

      if (expectedSignature !== signedCommand.signature) {
        throw new Error('Invalid signature');
      }

      // Check for replay attack (simple nonce check)
      const usedNonces = await this.getUsedNonces();
      if (usedNonces.includes(signedCommand.nonce)) {
        throw new Error('Command already executed (replay attack)');
      }

      // Mark nonce as used
      usedNonces.push(signedCommand.nonce);
      await AsyncStorage.setItem('used_nonces', JSON.stringify(usedNonces.slice(-100))); // Keep last 100

      // Log command execution
      await this.logPairingEvent('command_executed', {
        senderId: signedCommand.senderId,
        receiverId: signedCommand.receiverId,
        command: signedCommand.command,
        nonce: signedCommand.nonce
      });

      // Execute command (basic implementation)
      const result = await this.executeCommand(signedCommand.command);

      return { success: true, result };
    } catch (error) {
      console.error('Error verifying command:', error);
      await this.logPairingEvent('command_failed', {
        senderId: signedCommand.senderId || 'unknown',
        receiverId: currentDeviceId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  // Execute command (extend as needed)
  static async executeCommand(command) {
    // Basic command execution - extend for specific commands
    switch (command) {
      case 'ping':
        return 'pong';
      case 'status':
        return { deviceId: await DeviceManager.getDeviceId(), timestamp: new Date() };
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  // Get used nonces for replay prevention
  static async getUsedNonces() {
    try {
      const data = await AsyncStorage.getItem('used_nonces');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting used nonces:', error);
      return [];
    }
  }

  // Log pairing events
  static async logPairingEvent(action, data) {
    try {
      const db = this.getDB();
      await addDoc(collection(db, 'pairing_events'), {
        action,
        ...data,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error logging pairing event:', error);
    }
  }
}

export default PairingManager;