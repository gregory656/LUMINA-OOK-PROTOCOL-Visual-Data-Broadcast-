import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { PairingSession, Permission, AuditLog } from '../types';

export class SessionManager {
  static SESSION_STORAGE_KEY = 'active_sessions';

  // Create a new pairing session
  static async createSession(devices, type = 'session', permissions = [], expiresInMinutes = 60) {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = type === 'temporary' ? new Date(Date.now() + (expiresInMinutes * 60 * 1000)) : null;

      const session = {
        id: sessionId,
        devices: devices,
        type: type,
        expiresAt: expiresAt,
        permissions: permissions,
        createdAt: new Date(),
        lastActivity: new Date(),
        status: 'active'
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'pairing_sessions', sessionId), session);

      // Store locally for quick access
      await this.storeSessionLocally(session);

      // Log session creation
      await this.logSessionEvent('session_created', sessionId, { devices, type, permissions });

      return session;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  // Get active session for device
  static async getActiveSession(deviceId) {
    try {
      const db = getFirestore(getFirebaseApp());

      // Query for sessions containing this device
      const sessionsRef = collection(db, 'pairing_sessions');
      const q = query(
        sessionsRef,
        where('devices', 'array-contains', deviceId),
        where('status', '==', 'active')
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const sessionDoc = querySnapshot.docs[0];
        const session = { id: sessionDoc.id, ...sessionDoc.data() };

        // Check if session has expired
        if (session.expiresAt && new Date() > session.expiresAt.toDate()) {
          await this.expireSession(session.id);
          return null;
        }

        return session;
      }

      return null;
    } catch (error) {
      console.error('Error getting active session:', error);
      return null;
    }
  }

  // Check if devices are in an active session
  static async areDevicesPaired(deviceId1, deviceId2) {
    try {
      const session = await this.getActiveSession(deviceId1);
      if (!session) return false;

      return session.devices.includes(deviceId2);
    } catch (error) {
      console.error('Error checking device pairing:', error);
      return false;
    }
  }

  // Check permission for an action in a session
  static async checkPermission(sessionId, deviceId, resource, action) {
    try {
      const session = await this.getSessionById(sessionId);
      if (!session || session.status !== 'active') return false;

      // Check if device is in session
      if (!session.devices.includes(deviceId)) return false;

      // Check if session has expired
      if (session.expiresAt && new Date() > session.expiresAt.toDate()) {
        await this.expireSession(sessionId);
        return false;
      }

      // Check permissions
      const relevantPermissions = session.permissions.filter(p =>
        p.resource === resource || p.resource === '*'
      );

      for (const permission of relevantPermissions) {
        if (permission.actions.includes(action) || permission.actions.includes('*')) {
          // Check conditions if any
          if (permission.conditions) {
            // Implement condition checking logic here
            // For now, assume conditions are met
            return true;
          }
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  // Extend session expiry
  static async extendSession(sessionId, additionalMinutes = 30) {
    try {
      const db = getFirestore(getFirebaseApp());
      const newExpiry = new Date(Date.now() + (additionalMinutes * 60 * 1000));

      await updateDoc(doc(db, 'pairing_sessions', sessionId), {
        expiresAt: newExpiry,
        lastActivity: new Date()
      });

      await this.logSessionEvent('session_extended', sessionId, { newExpiry, additionalMinutes });

      return true;
    } catch (error) {
      console.error('Error extending session:', error);
      return false;
    }
  }

  // Expire session
  static async expireSession(sessionId) {
    try {
      const db = getFirestore(getFirebaseApp());

      await updateDoc(doc(db, 'pairing_sessions', sessionId), {
        status: 'expired',
        expiredAt: new Date()
      });

      await this.removeSessionLocally(sessionId);
      await this.logSessionEvent('session_expired', sessionId);

      return true;
    } catch (error) {
      console.error('Error expiring session:', error);
      return false;
    }
  }

  // Revoke session (admin action)
  static async revokeSession(sessionId, reason = '') {
    try {
      const db = getFirestore(getFirebaseApp());

      await updateDoc(doc(db, 'pairing_sessions', sessionId), {
        status: 'revoked',
        revokedAt: new Date(),
        revokeReason: reason
      });

      await this.removeSessionLocally(sessionId);
      await this.logSessionEvent('session_revoked', sessionId, { reason });

      return true;
    } catch (error) {
      console.error('Error revoking session:', error);
      return false;
    }
  }

  // Get session by ID
  static async getSessionById(sessionId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const sessionDoc = await getDoc(doc(db, 'pairing_sessions', sessionId));

      if (sessionDoc.exists()) {
        return { id: sessionDoc.id, ...sessionDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting session by ID:', error);
      return null;
    }
  }

  // Get all active sessions for a device
  static async getDeviceSessions(deviceId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const sessionsRef = collection(db, 'pairing_sessions');
      const q = query(
        sessionsRef,
        where('devices', 'array-contains', deviceId),
        where('status', '==', 'active')
      );

      const querySnapshot = await getDocs(q);
      const sessions = [];

      querySnapshot.forEach((doc) => {
        sessions.push({ id: doc.id, ...doc.data() });
      });

      return sessions;
    } catch (error) {
      console.error('Error getting device sessions:', error);
      return [];
    }
  }

  // Update session activity
  static async updateSessionActivity(sessionId) {
    try {
      const db = getFirestore(getFirebaseApp());
      await updateDoc(doc(db, 'pairing_sessions', sessionId), {
        lastActivity: new Date()
      });
      return true;
    } catch (error) {
      console.error('Error updating session activity:', error);
      return false;
    }
  }

  // Clean up expired sessions
  static async cleanupExpiredSessions() {
    try {
      const db = getFirestore(getFirebaseApp());
      const sessionsRef = collection(db, 'pairing_sessions');
      const q = query(sessionsRef, where('status', '==', 'active'));
      const querySnapshot = await getDocs(q);

      const expiredSessions = [];
      querySnapshot.forEach((doc) => {
        const session = { id: doc.id, ...doc.data() };
        if (session.expiresAt && new Date() > session.expiresAt.toDate()) {
          expiredSessions.push(session.id);
        }
      });

      // Expire found sessions
      for (const sessionId of expiredSessions) {
        await this.expireSession(sessionId);
      }

      return expiredSessions.length;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  // Local storage helpers
  static async storeSessionLocally(session) {
    try {
      const stored = await AsyncStorage.getItem(this.SESSION_STORAGE_KEY);
      const sessions = stored ? JSON.parse(stored) : {};

      sessions[session.id] = session;
      await AsyncStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error storing session locally:', error);
    }
  }

  static async removeSessionLocally(sessionId) {
    try {
      const stored = await AsyncStorage.getItem(this.SESSION_STORAGE_KEY);
      if (stored) {
        const sessions = JSON.parse(stored);
        delete sessions[sessionId];
        await AsyncStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch (error) {
      console.error('Error removing session locally:', error);
    }
  }

  // Analytics and tracking
  static async getSessionAnalytics(deviceId, periodDays = 30) {
    try {
      const db = getFirestore(getFirebaseApp());
      const startDate = new Date(Date.now() - (periodDays * 24 * 60 * 60 * 1000));

      const sessionsRef = collection(db, 'pairing_sessions');
      const q = query(
        sessionsRef,
        where('devices', 'array-contains', deviceId),
        where('createdAt', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        totalSessions: 0,
        activeSessions: 0,
        expiredSessions: 0,
        revokedSessions: 0,
        averageSessionDuration: 0,
        sessionsByType: {}
      };

      querySnapshot.forEach((doc) => {
        const session = doc.data();
        analytics.totalSessions++;

        if (session.status === 'active') analytics.activeSessions++;
        else if (session.status === 'expired') analytics.expiredSessions++;
        else if (session.status === 'revoked') analytics.revokedSessions++;

        // Track by type
        analytics.sessionsByType[session.type] = (analytics.sessionsByType[session.type] || 0) + 1;
      });

      return analytics;
    } catch (error) {
      console.error('Error getting session analytics:', error);
      return null;
    }
  }

  // Audit logging
  static async logSessionEvent(action, sessionId, details = {}) {
    try {
      const db = getFirestore(getFirebaseApp());
      const auditLog = {
        timestamp: new Date(),
        action,
        actor: 'system', // Could be device ID or user ID
        target: sessionId,
        details,
        success: true,
        severity: 'info'
      };

      await setDoc(doc(collection(db, 'audit_logs')), auditLog);
    } catch (error) {
      console.error('Error logging session event:', error);
    }
  }

  // Real-time session monitoring
  static subscribeToSessionUpdates(sessionId, callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const sessionRef = doc(db, 'pairing_sessions', sessionId);

      return onSnapshot(sessionRef, (doc) => {
        if (doc.exists()) {
          callback({ id: doc.id, ...doc.data() });
        }
      });
    } catch (error) {
      console.error('Error subscribing to session updates:', error);
      return null;
    }
  }

  // Bulk operations
  static async expireAllSessionsForDevice(deviceId) {
    try {
      const sessions = await this.getDeviceSessions(deviceId);
      const expiredCount = 0;

      for (const session of sessions) {
        await this.expireSession(session.id);
        expiredCount++;
      }

      return expiredCount;
    } catch (error) {
      console.error('Error expiring all sessions for device:', error);
      return 0;
    }
  }
}

export default SessionManager;