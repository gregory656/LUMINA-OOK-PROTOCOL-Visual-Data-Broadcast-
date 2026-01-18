import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { UIState, Notification } from '../types';

export class UIManager {
  static UI_CONFIG_STORAGE_KEY = 'ui_config';
  static NOTIFICATIONS_STORAGE_KEY = 'notifications';

  // Theme Management
  static THEMES = {
    light: {
      name: 'Light',
      colors: {
        primary: '#007AFF',
        secondary: '#5856D6',
        background: '#FFFFFF',
        surface: '#F2F2F7',
        text: '#000000',
        textSecondary: '#8E8E93',
        border: '#C6C6C8',
        error: '#FF3B30',
        success: '#34C759',
        warning: '#FF9500'
      }
    },
    dark: {
      name: 'Dark',
      colors: {
        primary: '#0A84FF',
        secondary: '#5E5CE6',
        background: '#000000',
        surface: '#1C1C1E',
        text: '#FFFFFF',
        textSecondary: '#8E8E93',
        border: '#38383A',
        error: '#FF453A',
        success: '#30D158',
        warning: '#FF9F0A'
      }
    },
    auto: {
      name: 'Auto',
      colors: {} // Will be determined by system preference
    }
  };

  // Get UI configuration
  static async getUIConfig() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const configRef = doc(db, 'ui_configs', deviceId);
      const configDoc = await getDoc(configRef);

      if (configDoc.exists()) {
        return { ...configDoc.data() };
      }

      // Create default config
      const defaultConfig = {
        theme: 'auto',
        animations: true,
        hapticFeedback: true,
        soundEffects: true,
        fontSize: 'medium',
        language: 'en',
        quickActions: this.getDefaultQuickActions(),
        shortcuts: this.getDefaultShortcuts(),
        notificationSettings: {
          pairing: true,
          messages: true,
          files: true,
          security: true,
          system: false
        },
        doNotDisturb: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
          days: [1, 2, 3, 4, 5] // Monday to Friday
        }
      };

      await setDoc(configRef, defaultConfig);
      return defaultConfig;
    } catch (error) {
      console.error('Error getting UI config:', error);
      return {};
    }
  }

  // Update UI configuration
  static async updateUIConfig(updates) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const configRef = doc(db, 'ui_configs', deviceId);
      await updateDoc(configRef, updates);

      return true;
    } catch (error) {
      console.error('Error updating UI config:', error);
      return false;
    }
  }

  // Theme management
  static async setTheme(theme) {
    if (!this.THEMES[theme]) {
      throw new Error('Invalid theme');
    }

    await this.updateUIConfig({ theme });
    return this.getThemeColors(theme);
  }

  static getThemeColors(theme) {
    if (theme === 'auto') {
      // In a real implementation, this would check system preference
      // For now, default to light
      return this.THEMES.light.colors;
    }
    return this.THEMES[theme].colors;
  }

  static async getCurrentThemeColors() {
    const config = await this.getUIConfig();
    return this.getThemeColors(config.theme);
  }

  // Quick Actions
  static getDefaultQuickActions() {
    return [
      {
        id: 'send_message',
        name: 'Send Message',
        icon: '💬',
        action: 'sendMessage',
        category: 'communication',
        enabled: true
      },
      {
        id: 'share_location',
        name: 'Share Location',
        icon: '📍',
        action: 'shareLocation',
        category: 'communication',
        enabled: true
      },
      {
        id: 'send_file',
        name: 'Send File',
        icon: '📎',
        action: 'sendFile',
        category: 'communication',
        enabled: true
      },
      {
        id: 'create_game',
        name: 'Create Game',
        icon: '🎮',
        action: 'createGame',
        category: 'gaming',
        enabled: true
      },
      {
        id: 'check_assets',
        name: 'Check Assets',
        icon: '📦',
        action: 'checkAssets',
        category: 'enterprise',
        enabled: false
      }
    ];
  }

  static async updateQuickAction(actionId, updates) {
    try {
      const config = await this.getUIConfig();
      const actions = config.quickActions || [];
      const actionIndex = actions.findIndex(a => a.id === actionId);

      if (actionIndex !== -1) {
        actions[actionIndex] = { ...actions[actionIndex], ...updates };
        await this.updateUIConfig({ quickActions: actions });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error updating quick action:', error);
      return false;
    }
  }

  // Keyboard Shortcuts
  static getDefaultShortcuts() {
    return [
      {
        id: 'send_message',
        key: 'Enter',
        modifiers: ['Ctrl'],
        action: 'sendMessage',
        description: 'Send message'
      },
      {
        id: 'new_game',
        key: 'G',
        modifiers: ['Ctrl', 'Shift'],
        action: 'createGame',
        description: 'Create new game'
      },
      {
        id: 'toggle_theme',
        key: 'T',
        modifiers: ['Ctrl'],
        action: 'toggleTheme',
        description: 'Toggle theme'
      },
      {
        id: 'focus_search',
        key: 'K',
        modifiers: ['Ctrl'],
        action: 'focusSearch',
        description: 'Focus search'
      }
    ];
  }

  static async addShortcut(shortcut) {
    try {
      const config = await this.getUIConfig();
      const shortcuts = config.shortcuts || [];
      shortcuts.push(shortcut);
      await this.updateUIConfig({ shortcuts });
      return true;
    } catch (error) {
      console.error('Error adding shortcut:', error);
      return false;
    }
  }

  static async removeShortcut(shortcutId) {
    try {
      const config = await this.getUIConfig();
      const shortcuts = (config.shortcuts || []).filter(s => s.id !== shortcutId);
      await this.updateUIConfig({ shortcuts });
      return true;
    } catch (error) {
      console.error('Error removing shortcut:', error);
      return false;
    }
  }

  // Haptic Feedback
  static async triggerHapticFeedback(type = 'light') {
    try {
      const config = await this.getUIConfig();
      if (!config.hapticFeedback) return;

      switch (type) {
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
        case 'warning':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        default:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error('Error triggering haptic feedback:', error);
    }
  }

  // Sound Effects
  static soundObjects = new Map();

  static async playSoundEffect(effect) {
    try {
      const config = await this.getUIConfig();
      if (!config.soundEffects) return;

      const soundFiles = {
        message: 'message.mp3',
        notification: 'notification.mp3',
        error: 'error.mp3',
        success: 'success.mp3',
        button: 'button.mp3'
      };

      const soundFile = soundFiles[effect];
      if (!soundFile) return;

      // In a real implementation, you would load and play the sound file
      // For now, we'll simulate with console.log
      console.log(`Playing sound: ${soundFile}`);

      // Example of actual implementation:
      // const { sound } = await Audio.Sound.createAsync(
      //   { uri: `assets/sounds/${soundFile}` }
      // );
      // await sound.playAsync();
      // this.soundObjects.set(effect, sound);

    } catch (error) {
      console.error('Error playing sound effect:', error);
    }
  }

  static async stopAllSounds() {
    try {
      for (const sound of this.soundObjects.values()) {
        await sound.unloadAsync();
      }
      this.soundObjects.clear();
    } catch (error) {
      console.error('Error stopping sounds:', error);
    }
  }

  // Gesture Controls
  static gestureHandlers = new Map();

  static registerGestureHandler(gesture, handler) {
    this.gestureHandlers.set(gesture, handler);
  }

  static unregisterGestureHandler(gesture) {
    this.gestureHandlers.delete(gesture);
  }

  static async handleGesture(gesture, data) {
    try {
      const config = await this.getUIConfig();
      if (!config.animations) return;

      const handler = this.gestureHandlers.get(gesture);
      if (handler) {
        await handler(data);
        await this.triggerHapticFeedback('light');
      }
    } catch (error) {
      console.error('Error handling gesture:', error);
    }
  }

  // Notification System
  static async createNotification(notificationData) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deviceId,
        type: notificationData.type || 'system',
        title: notificationData.title,
        message: notificationData.message,
        priority: notificationData.priority || 'normal',
        actions: notificationData.actions || [],
        expiresAt: notificationData.expiresAt,
        createdAt: new Date(),
        read: false,
        data: notificationData.data || {}
      };

      await setDoc(doc(collection(db, 'notifications')), notification);

      // Store locally for quick access
      await this.storeNotificationLocally(notification);

      // Trigger immediate display if high priority
      if (notification.priority === 'high' || notification.priority === 'critical') {
        await this.displayNotification(notification);
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  static async getNotifications(limit = 50) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('deviceId', '==', deviceId),
        orderBy('createdAt', 'desc'),
        limit(limit)
      );

      const querySnapshot = await getDocs(q);
      const notifications = [];

      querySnapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() });
      });

      return notifications;
    } catch (error) {
      console.error('Error getting notifications:', error);
      return [];
    }
  }

  static async markNotificationAsRead(notificationId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const notificationRef = doc(db, 'notifications', notificationId);

      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }

  static async deleteNotification(notificationId) {
    try {
      const db = getFirestore(getFirebaseApp());
      await deleteDoc(doc(db, 'notifications', notificationId));

      // Remove from local storage
      await this.removeNotificationLocally(notificationId);

      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }

  static async displayNotification(notification) {
    try {
      const config = await this.getUIConfig();

      // Check if notifications are muted
      if (await this.isDoNotDisturbActive()) {
        return;
      }

      // In a real implementation, this would show a native notification
      console.log('Displaying notification:', notification);

      // Play sound effect
      if (config.soundEffects) {
        await this.playSoundEffect('notification');
      }

      // Trigger haptic feedback
      if (config.hapticFeedback) {
        await this.triggerHapticFeedback('medium');
      }

    } catch (error) {
      console.error('Error displaying notification:', error);
    }
  }

  // Do Not Disturb
  static async isDoNotDisturbActive() {
    try {
      const config = await this.getUIConfig();
      if (!config.doNotDisturb?.enabled) return false;

      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

      // Check if current day is included
      if (!config.doNotDisturb.days.includes(currentDay)) return false;

      // Check if current time is within range
      const startTime = config.doNotDisturb.startTime;
      const endTime = config.doNotDisturb.endTime;

      return currentTime >= startTime && currentTime <= endTime;
    } catch (error) {
      console.error('Error checking Do Not Disturb:', error);
      return false;
    }
  }

  static async setDoNotDisturb(enabled, startTime = '22:00', endTime = '08:00', days = [1, 2, 3, 4, 5]) {
    try {
      await this.updateUIConfig({
        doNotDisturb: { enabled, startTime, endTime, days }
      });
      return true;
    } catch (error) {
      console.error('Error setting Do Not Disturb:', error);
      return false;
    }
  }

  // Accessibility
  static async setFontSize(size) {
    if (!['small', 'medium', 'large'].includes(size)) {
      throw new Error('Invalid font size');
    }

    await this.updateUIConfig({ fontSize: size });
    return true;
  }

  static async setLanguage(language) {
    // In a real implementation, you would validate supported languages
    await this.updateUIConfig({ language });
    return true;
  }

  // Animation controls
  static async setAnimationsEnabled(enabled) {
    await this.updateUIConfig({ animations: enabled });
    return true;
  }

  // Smart notifications based on context
  static async createSmartNotification(context, data) {
    try {
      const config = await this.getUIConfig();

      let notification = null;

      switch (context) {
        case 'pairing_success':
          if (config.notificationSettings.pairing) {
            notification = await this.createNotification({
              type: 'pairing',
              title: 'Device Paired',
              message: `Successfully paired with ${data.deviceName}`,
              priority: 'normal',
              actions: [
                { id: 'view_device', label: 'View Device', action: () => {} },
                { id: 'send_message', label: 'Send Message', action: () => {} }
              ]
            });
          }
          break;

        case 'message_received':
          if (config.notificationSettings.messages) {
            notification = await this.createNotification({
              type: 'message',
              title: 'New Message',
              message: `Message from ${data.senderName}`,
              priority: 'normal',
              actions: [
                { id: 'reply', label: 'Reply', action: () => {} },
                { id: 'view_conversation', label: 'View Conversation', action: () => {} }
              ]
            });
          }
          break;

        case 'file_received':
          if (config.notificationSettings.files) {
            notification = await this.createNotification({
              type: 'file',
              title: 'File Received',
              message: `Received ${data.fileName} from ${data.senderName}`,
              priority: 'normal',
              actions: [
                { id: 'open_file', label: 'Open File', action: () => {} },
                { id: 'save_file', label: 'Save File', action: () => {} }
              ]
            });
          }
          break;

        case 'security_alert':
          if (config.notificationSettings.security) {
            notification = await this.createNotification({
              type: 'security',
              title: 'Security Alert',
              message: data.message,
              priority: 'high',
              actions: [
                { id: 'view_details', label: 'View Details', action: () => {} },
                { id: 'dismiss', label: 'Dismiss', action: () => {} }
              ]
            });
          }
          break;

        case 'game_invite':
          notification = await this.createNotification({
            type: 'game',
            title: 'Game Invite',
            message: `${data.senderName} invited you to play ${data.gameName}`,
            priority: 'normal',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
            actions: [
              { id: 'accept', label: 'Accept', action: () => {} },
              { id: 'decline', label: 'Decline', action: () => {} }
            ]
          });
          break;
      }

      return notification;
    } catch (error) {
      console.error('Error creating smart notification:', error);
      return null;
    }
  }

  // Local storage helpers
  static async storeNotificationLocally(notification) {
    try {
      const stored = await AsyncStorage.getItem(this.NOTIFICATIONS_STORAGE_KEY);
      const notifications = stored ? JSON.parse(stored) : [];
      notifications.unshift(notification); // Add to beginning

      // Keep only last 100 notifications locally
      if (notifications.length > 100) {
        notifications.splice(100);
      }

      await AsyncStorage.setItem(this.NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Error storing notification locally:', error);
    }
  }

  static async removeNotificationLocally(notificationId) {
    try {
      const stored = await AsyncStorage.getItem(this.NOTIFICATIONS_STORAGE_KEY);
      if (stored) {
        const notifications = JSON.parse(stored).filter(n => n.id !== notificationId);
        await AsyncStorage.setItem(this.NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
      }
    } catch (error) {
      console.error('Error removing notification locally:', error);
    }
  }

  // Real-time UI updates
  static subscribeToNotifications(callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const deviceId = DeviceManager.getDeviceId(); // Synchronous call for subscription

      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('deviceId', '==', deviceId),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      return onSnapshot(q, (snapshot) => {
        const notifications = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            notifications.push({ id: change.doc.id, ...change.doc.data() });
          }
        });
        if (notifications.length > 0) {
          callback(notifications);
        }
      });
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      return null;
    }
  }

  // Bulk operations
  static async clearAllNotifications() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const notificationsRef = collection(db, 'notifications');
      const q = query(notificationsRef, where('deviceId', '==', deviceId));

      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // Clear local storage
      await AsyncStorage.removeItem(this.NOTIFICATIONS_STORAGE_KEY);

      return true;
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return false;
    }
  }

  static async markAllAsRead() {
    try {
      const notifications = await this.getNotifications(100);
      const unreadNotifications = notifications.filter(n => !n.read);

      const db = getFirestore(getFirebaseApp());
      const batch = writeBatch(db);

      unreadNotifications.forEach(notification => {
        const notificationRef = doc(db, 'notifications', notification.id);
        batch.update(notificationRef, {
          read: true,
          readAt: new Date()
        });
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  }
}

export default UIManager;