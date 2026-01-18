import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { DeviceProfile } from '../types';

// Firebase configuration - should match backend
const firebaseConfig = {
  apiKey: "your-api-key", // Will be set via environment
  authDomain: "your-project.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "vigil-edge",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase (only once)
let app;
let db;

const getFirebaseApp = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
};

const getFirestoreDB = () => {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
};

// Generate short, readable device ID (like XUFE123)
const generateShortDeviceId = async () => {
  try {
    const randomBytes = await Crypto.getRandomBytesAsync(4); // 4 bytes = 8 hex chars

    // Convert to uppercase hex and take first 7 characters
    const hex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
    const shortId = hex.substring(0, 7);

    // Add a prefix for readability
    const prefixes = ['XUFE', 'VLCS', 'PAIR', 'SYNC', 'LINK', 'CODE'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

    return `${prefix}${shortId}`;
  } catch (error) {
    console.error('Error generating short device ID:', error);
    // Fallback to simple format
    const timestamp = Date.now().toString().slice(-4);
    const random = Math.random().toString(36).substr(2, 3).toUpperCase();
    return `DEV${timestamp}${random}`;
  }
};

export class DeviceManager {
  static DEVICE_ID_KEY = 'device_id';
  static DEVICE_REGISTERED_KEY = 'device_registered';

  // Generate or retrieve persistent device ID
  static async getDeviceId() {
    try {
      // Try SecureStore first (more secure)
      let deviceId = await SecureStore.getItemAsync(this.DEVICE_ID_KEY);

      if (!deviceId) {
        // Fallback to AsyncStorage
        deviceId = await AsyncStorage.getItem(this.DEVICE_ID_KEY);
      }

      if (!deviceId) {
        // Generate new short device ID
        deviceId = await generateShortDeviceId();
        console.log('Generated new device ID:', deviceId);

        // Store in both places
        await SecureStore.setItemAsync(this.DEVICE_ID_KEY, deviceId);
        await AsyncStorage.setItem(this.DEVICE_ID_KEY, deviceId);
      }

      return deviceId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      // Generate temporary ID if storage fails
      return await generateShortDeviceId();
    }
  }

  // Register device in Firestore
  static async registerDevice() {
    try {
      const deviceId = await this.getDeviceId();
      const db = getFirestoreDB();

      // Check if already registered
      const deviceRef = doc(db, 'devices', deviceId);
      const deviceDoc = await getDoc(deviceRef);

      if (deviceDoc.exists()) {
        console.log('Device already registered:', deviceId);
        await AsyncStorage.setItem(this.DEVICE_REGISTERED_KEY, 'true');
        return true;
      }

      // Register new device
      const deviceData = {
        deviceId,
        registeredAt: new Date(),
        lastSeen: new Date(),
        status: 'active',
        platform: 'react-native'
      };

      await setDoc(deviceRef, deviceData);
      await AsyncStorage.setItem(this.DEVICE_REGISTERED_KEY, 'true');

      console.log('Device registered successfully:', deviceId);
      return true;
    } catch (error) {
      console.error('Error registering device:', error);
      return false;
    }
  }

  // Check if device is registered
  static async isDeviceRegistered() {
    try {
      const registered = await AsyncStorage.getItem(this.DEVICE_REGISTERED_KEY);
      return registered === 'true';
    } catch (error) {
      console.error('Error checking device registration:', error);
      return false;
    }
  }

  // Update device last seen
  static async updateLastSeen() {
    try {
      const deviceId = await this.getDeviceId();
      const db = getFirestoreDB();

      await setDoc(doc(db, 'devices', deviceId), {
        lastSeen: new Date()
      }, { merge: true });

      return true;
    } catch (error) {
      console.error('Error updating last seen:', error);
      return false;
    }
  }

  // Get or create device profile
  static async getDeviceProfile(deviceId = null) {
    try {
      const targetDeviceId = deviceId || await this.getDeviceId();
      const db = getFirestoreDB();

      const profileRef = doc(db, 'device_profiles', targetDeviceId);
      const profileDoc = await getDoc(profileRef);

      if (profileDoc.exists()) {
        const data = profileDoc.data();
        return {
          id: targetDeviceId,
          nickname: data.nickname,
          avatar: data.avatar,
          category: data.category || 'temporary',
          trustLevel: data.trustLevel || 'basic',
          lastSeen: data.lastSeen?.toDate() || new Date(),
          capabilities: data.capabilities || [],
          metadata: data.metadata || {},
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      }

      // Create default profile
      const defaultProfile = {
        id: targetDeviceId,
        category: 'temporary',
        trustLevel: 'basic',
        lastSeen: new Date(),
        capabilities: this.detectCapabilities(),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(profileRef, defaultProfile);
      return defaultProfile;
    } catch (error) {
      console.error('Error getting device profile:', error);
      return null;
    }
  }

  // Update device profile
  static async updateDeviceProfile(updates) {
    try {
      const deviceId = await this.getDeviceId();
      const db = getFirestoreDB();

      const profileRef = doc(db, 'device_profiles', deviceId);
      await updateDoc(profileRef, {
        ...updates,
        updatedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error updating device profile:', error);
      return false;
    }
  }

  // Set device nickname
  static async setDeviceNickname(nickname) {
    return await this.updateDeviceProfile({ nickname });
  }

  // Set device avatar
  static async setDeviceAvatar(avatarUri) {
    return await this.updateDeviceProfile({ avatar: avatarUri });
  }

  // Set device category
  static async setDeviceCategory(category) {
    if (!['family', 'work', 'friends', 'temporary'].includes(category)) {
      throw new Error('Invalid device category');
    }
    return await this.updateDeviceProfile({ category });
  }

  // Set trust level
  static async setTrustLevel(trustLevel) {
    if (!['basic', 'trusted', 'admin'].includes(trustLevel)) {
      throw new Error('Invalid trust level');
    }
    return await this.updateDeviceProfile({ trustLevel });
  }

  // Detect device capabilities
  static detectCapabilities() {
    const capabilities = ['vlc_transmission', 'vlc_reception'];

    // Add platform-specific capabilities
    capabilities.push('mobile_device');

    // Add sensor capabilities
    capabilities.push('camera', 'accelerometer', 'gyroscope');

    // Add communication capabilities
    capabilities.push('wifi', 'bluetooth', 'nfc');

    return capabilities;
  }

  // Add custom metadata
  static async addDeviceMetadata(key, value) {
    try {
      const profile = await this.getDeviceProfile();
      if (!profile) return false;

      const metadata = { ...profile.metadata, [key]: value };
      return await this.updateDeviceProfile({ metadata });
    } catch (error) {
      console.error('Error adding device metadata:', error);
      return false;
    }
  }

  // Get devices by category
  static async getDevicesByCategory(category) {
    try {
      const db = getFirestoreDB();
      const profilesRef = collection(db, 'device_profiles');
      const q = query(profilesRef, where('category', '==', category));
      const querySnapshot = await getDocs(q);

      const devices = [];
      querySnapshot.forEach((doc) => {
        devices.push({ id: doc.id, ...doc.data() });
      });

      return devices;
    } catch (error) {
      console.error('Error getting devices by category:', error);
      return [];
    }
  }

  // Get trusted devices
  static async getTrustedDevices() {
    try {
      const db = getFirestoreDB();
      const profilesRef = collection(db, 'device_profiles');
      const q = query(profilesRef, where('trustLevel', 'in', ['trusted', 'admin']));
      const querySnapshot = await getDocs(q);

      const devices = [];
      querySnapshot.forEach((doc) => {
        devices.push({ id: doc.id, ...doc.data() });
      });

      return devices;
    } catch (error) {
      console.error('Error getting trusted devices:', error);
      return [];
    }
  }
}

export default DeviceManager;