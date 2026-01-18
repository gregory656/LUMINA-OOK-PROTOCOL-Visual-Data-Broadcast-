import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, writeBatch } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { AnalyticsData, AuditLog } from '../types';

export class AnalyticsManager {
  static ANALYTICS_STORAGE_KEY = 'analytics_cache';
  static AUDIT_STORAGE_KEY = 'audit_logs';

  // Comprehensive Analytics
  static async getComprehensiveAnalytics(deviceId = null, period = { days: 30 }) {
    try {
      const targetDeviceId = deviceId || await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const startDate = new Date(Date.now() - (period.days * 24 * 60 * 60 * 1000));

      const analytics = {
        deviceId: targetDeviceId,
        period,
        pairings: await this.getPairingAnalytics(targetDeviceId, startDate),
        transfers: await this.getTransferAnalytics(targetDeviceId, startDate),
        commands: await this.getCommandAnalytics(targetDeviceId, startDate),
        security: await this.getSecurityAnalytics(targetDeviceId, startDate),
        performance: await this.getPerformanceAnalytics(targetDeviceId, startDate),
        generatedAt: new Date()
      };

      return analytics;
    } catch (error) {
      console.error('Error getting comprehensive analytics:', error);
      return null;
    }
  }

  // Pairing Analytics
  static async getPairingAnalytics(deviceId, startDate) {
    try {
      const db = getFirestore(getFirebaseApp());

      const pairingsRef = collection(db, 'pairing_sessions');
      const q = query(
        pairingsRef,
        where('devices', 'array-contains', deviceId),
        where('createdAt', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        totalPairings: 0,
        successfulPairings: 0,
        averagePairingTime: 0,
        pairingMethods: {},
        failureReasons: {},
        sessionTypes: {},
        activeSessions: 0
      };

      let totalPairingTime = 0;

      querySnapshot.forEach((doc) => {
        const session = doc.data();
        analytics.totalPairings++;

        if (session.status === 'active') analytics.activeSessions++;

        // Track session types
        analytics.sessionTypes[session.type] = (analytics.sessionTypes[session.type] || 0) + 1;

        // Estimate pairing time (simplified)
        if (session.createdAt && session.lastActivity) {
          const pairingTime = (session.lastActivity.toDate() - session.createdAt.toDate()) / 1000;
          if (pairingTime > 0 && pairingTime < 300) { // Reasonable pairing time
            totalPairingTime += pairingTime;
            analytics.successfulPairings++;
          }
        }
      });

      analytics.averagePairingTime = analytics.successfulPairings > 0 ?
        totalPairingTime / analytics.successfulPairings : 0;

      return analytics;
    } catch (error) {
      console.error('Error getting pairing analytics:', error);
      return {};
    }
  }

  // Transfer Analytics
  static async getTransferAnalytics(deviceId, startDate) {
    try {
      const db = getFirestore(getFirebaseApp());

      const transfersRef = collection(db, 'file_transfers');
      const q = query(
        transfersRef,
        where('senderId', '==', deviceId),
        where('createdAt', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        totalTransfers: 0,
        successfulTransfers: 0,
        averageTransferSpeed: 0,
        totalBytesTransferred: 0,
        fileTypes: {},
        averageTransferTime: 0
      };

      let totalSpeed = 0;
      let totalTime = 0;

      querySnapshot.forEach((doc) => {
        const transfer = doc.data();
        analytics.totalTransfers++;
        analytics.totalBytesTransferred += transfer.size || 0;

        if (transfer.status === 'complete') {
          analytics.successfulTransfers++;
        }

        // Estimate transfer time and speed
        if (transfer.createdAt && transfer.completedAt) {
          const transferTime = (transfer.completedAt.toDate() - transfer.createdAt.toDate()) / 1000;
          if (transferTime > 0) {
            const speed = (transfer.size || 0) / transferTime; // bytes per second
            totalSpeed += speed;
            totalTime += transferTime;
          }
        }

        // Track file types
        const fileType = this.getFileType(transfer.filename || '');
        analytics.fileTypes[fileType] = (analytics.fileTypes[fileType] || 0) + 1;
      });

      analytics.averageTransferSpeed = analytics.successfulTransfers > 0 ?
        totalSpeed / analytics.successfulTransfers : 0;
      analytics.averageTransferTime = analytics.successfulTransfers > 0 ?
        totalTime / analytics.successfulTransfers : 0;

      return analytics;
    } catch (error) {
      console.error('Error getting transfer analytics:', error);
      return {};
    }
  }

  // Command Analytics
  static async getCommandAnalytics(deviceId, startDate) {
    try {
      const db = getFirestore(getFirebaseApp());

      const commandsRef = collection(db, 'command_logs');
      const q = query(
        commandsRef,
        where('senderId', '==', deviceId),
        where('timestamp', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        totalCommands: 0,
        successfulCommands: 0,
        commandTypes: {},
        averageResponseTime: 0,
        popularCommands: []
      };

      let totalResponseTime = 0;

      querySnapshot.forEach((doc) => {
        const command = doc.data();
        analytics.totalCommands++;

        if (command.success) {
          analytics.successfulCommands++;
        }

        // Track command types
        analytics.commandTypes[command.commandType || command.type] =
          (analytics.commandTypes[command.commandType || command.type] || 0) + 1;

        // Estimate response time (simplified)
        if (command.timestamp && command.processedAt) {
          const responseTime = (command.processedAt.toDate() - command.timestamp.toDate()) / 1000;
          if (responseTime > 0 && responseTime < 60) { // Reasonable response time
            totalResponseTime += responseTime;
          }
        }
      });

      analytics.averageResponseTime = analytics.successfulCommands > 0 ?
        totalResponseTime / analytics.successfulCommands : 0;

      // Get popular commands
      analytics.popularCommands = Object.entries(analytics.commandTypes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([command, count]) => ({ command, count }));

      return analytics;
    } catch (error) {
      console.error('Error getting command analytics:', error);
      return {};
    }
  }

  // Security Analytics
  static async getSecurityAnalytics(deviceId, startDate) {
    try {
      const db = getFirestore(getFirebaseApp());

      const auditRef = collection(db, 'audit_logs');
      const q = query(
        auditRef,
        where('actor', '==', deviceId),
        where('timestamp', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        failedAuthAttempts: 0,
        blockedIPs: new Set(),
        suspiciousActivities: 0,
        securityIncidents: [],
        totalActions: 0
      };

      querySnapshot.forEach((doc) => {
        const log = doc.data();
        analytics.totalActions++;

        if (!log.success) {
          analytics.failedAuthAttempts++;
        }

        if (log.severity === 'high' || log.severity === 'critical') {
          analytics.securityIncidents.push({
            id: doc.id,
            ...log
          });
        }

        if (this.isSuspiciousActivity(log)) {
          analytics.suspiciousActivities++;
        }
      });

      analytics.blockedIPs = Array.from(analytics.blockedIPs);
      return analytics;
    } catch (error) {
      console.error('Error getting security analytics:', error);
      return {};
    }
  }

  // Performance Analytics
  static async getPerformanceAnalytics(deviceId, startDate) {
    try {
      const db = getFirestore(getFirebaseApp());

      const metricsRef = collection(db, 'vlc_quality_metrics');
      const q = query(
        metricsRef,
        where('sessionId', '>=', deviceId + '_'),
        where('timestamp', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        averageVLCRange: 0,
        averageTransmissionSpeed: 0,
        errorRate: 0,
        batteryImpact: 0,
        cpuUsage: 0,
        totalMeasurements: 0
      };

      let totalRange = 0;
      let totalSpeed = 0;
      let totalErrors = 0;
      let totalBattery = 0;
      let totalCPU = 0;

      querySnapshot.forEach((doc) => {
        const metric = doc.data();
        analytics.totalMeasurements++;

        totalRange += metric.distance || 0;
        totalSpeed += metric.transmissionSpeed || 0;
        totalErrors += metric.bitErrorRate || 0;
        totalBattery += metric.batteryImpact || 0;
        totalCPU += metric.cpuUsage || 0;
      });

      if (analytics.totalMeasurements > 0) {
        analytics.averageVLCRange = totalRange / analytics.totalMeasurements;
        analytics.averageTransmissionSpeed = totalSpeed / analytics.totalMeasurements;
        analytics.errorRate = totalErrors / analytics.totalMeasurements;
        analytics.batteryImpact = totalBattery / analytics.totalMeasurements;
        analytics.cpuUsage = totalCPU / analytics.totalMeasurements;
      }

      return analytics;
    } catch (error) {
      console.error('Error getting performance analytics:', error);
      return {};
    }
  }

  // Audit Trail System
  static async logAuditEvent(action, details = {}, target = null, severity = 'info') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const auditLog = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        action,
        actor: deviceId,
        target,
        details,
        success: true,
        severity,
        ipAddress: null, // Would be set by server
        userAgent: 'VLC Proximity Platform v1.0'
      };

      await setDoc(doc(collection(db, 'audit_logs')), auditLog);

      // Store locally for quick access
      await this.storeAuditLogLocally(auditLog);

      // Check for security alerts
      if (severity === 'high' || severity === 'critical') {
        await this.triggerSecurityAlert(auditLog);
      }

      return auditLog;
    } catch (error) {
      console.error('Error logging audit event:', error);
      return null;
    }
  }

  static async getAuditTrail(filters = {}, limitCount = 100) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      let q = query(
        collection(db, 'audit_logs'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      // Apply filters
      if (filters.actor) {
        q = query(q, where('actor', '==', filters.actor));
      }
      if (filters.action) {
        q = query(q, where('action', '==', filters.action));
      }
      if (filters.severity) {
        q = query(q, where('severity', '==', filters.severity));
      }
      if (filters.startDate) {
        q = query(q, where('timestamp', '>=', filters.startDate));
      }

      const querySnapshot = await getDocs(q);
      const auditTrail = [];

      querySnapshot.forEach((doc) => {
        auditTrail.push({ id: doc.id, ...doc.data() });
      });

      return auditTrail;
    } catch (error) {
      console.error('Error getting audit trail:', error);
      return [];
    }
  }

  static async exportAuditTrail(format = 'json', filters = {}) {
    try {
      const auditTrail = await this.getAuditTrail(filters, 1000); // Export up to 1000 records

      if (format === 'json') {
        return JSON.stringify(auditTrail, null, 2);
      } else if (format === 'csv') {
        return this.convertToCSV(auditTrail);
      }

      return auditTrail;
    } catch (error) {
      console.error('Error exporting audit trail:', error);
      return null;
    }
  }

  static convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      });
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  }

  // Real-time Alerting
  static async triggerSecurityAlert(auditLog) {
    try {
      const db = getFirestore(getFirebaseApp());

      const alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'security',
        severity: auditLog.severity,
        title: `Security Alert: ${auditLog.action}`,
        message: `Suspicious activity detected: ${auditLog.action}`,
        details: auditLog,
        triggeredAt: new Date(),
        status: 'active',
        recipients: await this.getAlertRecipients()
      };

      await setDoc(doc(collection(db, 'security_alerts')), alert);

      // Send immediate notifications
      await this.sendAlertNotifications(alert);

      return alert;
    } catch (error) {
      console.error('Error triggering security alert:', error);
      return null;
    }
  }

  static async getAlertRecipients() {
    try {
      // Get admin users and security team
      const db = getFirestore(getFirebaseApp());
      const profilesRef = collection(db, 'social_profiles');
      const q = query(profilesRef, where('trustLevel', '==', 'admin'));

      const querySnapshot = await getDocs(q);
      const recipients = [];

      querySnapshot.forEach((doc) => {
        recipients.push(doc.id);
      });

      return recipients;
    } catch (error) {
      console.error('Error getting alert recipients:', error);
      return [];
    }
  }

  static async sendAlertNotifications(alert) {
    try {
      // Send notifications to recipients (implementation would integrate with push notifications)
      console.log('Sending security alert:', alert);

      // Log notification attempts
      const db = getFirestore(getFirebaseApp());
      for (const recipient of alert.recipients) {
        await setDoc(doc(collection(db, 'notification_logs')), {
          alertId: alert.id,
          recipient,
          type: 'security_alert',
          sentAt: new Date(),
          status: 'sent' // In real implementation, would track delivery status
        });
      }
    } catch (error) {
      console.error('Error sending alert notifications:', error);
    }
  }

  // Compliance Reporting
  static async generateComplianceReport(period = { days: 90 }) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const startDate = new Date(Date.now() - (period.days * 24 * 60 * 60 * 1000));

      const report = {
        organizationId: deviceId,
        period,
        generatedAt: new Date(),
        sections: {
          access_control: await this.generateAccessControlReport(startDate),
          data_protection: await this.generateDataProtectionReport(startDate),
          audit_compliance: await this.generateAuditComplianceReport(startDate),
          security_incidents: await this.generateSecurityIncidentsReport(startDate)
        },
        overallCompliance: 0,
        recommendations: []
      };

      // Calculate overall compliance score
      const sectionScores = Object.values(report.sections).map(s => s.complianceScore || 0);
      report.overallCompliance = sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length;

      // Generate recommendations
      if (report.overallCompliance < 80) {
        report.recommendations.push('Implement stronger access controls');
        report.recommendations.push('Regular security audits required');
        report.recommendations.push('Enhance data encryption practices');
      }

      return report;
    } catch (error) {
      console.error('Error generating compliance report:', error);
      return null;
    }
  }

  static async generateAccessControlReport(startDate) {
    try {
      const auditTrail = await this.getAuditTrail({
        startDate,
        action: 'access_granted'
      }, 1000);

      return {
        totalAccessEvents: auditTrail.length,
        successfulAccess: auditTrail.filter(log => log.success).length,
        failedAccess: auditTrail.filter(log => !log.success).length,
        complianceScore: 85, // Simplified scoring
        issues: []
      };
    } catch (error) {
      console.error('Error generating access control report:', error);
      return { complianceScore: 0, issues: ['Failed to generate report'] };
    }
  }

  static async generateDataProtectionReport(startDate) {
    try {
      const auditTrail = await this.getAuditTrail({
        startDate,
        action: 'data_access'
      }, 1000);

      return {
        dataAccessEvents: auditTrail.length,
        encryptedTransfers: auditTrail.filter(log => log.details.encrypted).length,
        complianceScore: 90,
        issues: []
      };
    } catch (error) {
      console.error('Error generating data protection report:', error);
      return { complianceScore: 0, issues: ['Failed to generate report'] };
    }
  }

  static async generateAuditComplianceReport(startDate) {
    try {
      const auditTrail = await this.getAuditTrail({ startDate }, 1000);

      return {
        totalAuditEvents: auditTrail.length,
        completeLogs: auditTrail.filter(log => log.details.complete).length,
        complianceScore: 95,
        issues: []
      };
    } catch (error) {
      console.error('Error generating audit compliance report:', error);
      return { complianceScore: 0, issues: ['Failed to generate report'] };
    }
  }

  static async generateSecurityIncidentsReport(startDate) {
    try {
      const auditTrail = await this.getAuditTrail({
        startDate,
        severity: 'high'
      }, 1000);

      return {
        securityIncidents: auditTrail.length,
        resolvedIncidents: auditTrail.filter(log => log.details.resolved).length,
        complianceScore: auditTrail.length > 5 ? 70 : 95, // More incidents = lower score
        issues: auditTrail.length > 5 ? ['High number of security incidents'] : []
      };
    } catch (error) {
      console.error('Error generating security incidents report:', error);
      return { complianceScore: 0, issues: ['Failed to generate report'] };
    }
  }

  // Helper methods
  static getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image',
      'mp4': 'video', 'avi': 'video', 'mov': 'video',
      'mp3': 'audio', 'wav': 'audio', 'm4a': 'audio',
      'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document'
    };
    return typeMap[ext] || 'other';
  }

  static isSuspiciousActivity(log) {
    const suspiciousActions = [
      'failed_login',
      'unauthorized_access',
      'suspicious_command',
      'unusual_activity'
    ];

    return suspiciousActions.includes(log.action) ||
           log.severity === 'high' ||
           log.severity === 'critical';
  }

  static async storeAuditLogLocally(auditLog) {
    try {
      const stored = await AsyncStorage.getItem(this.AUDIT_STORAGE_KEY);
      const logs = stored ? JSON.parse(stored) : [];
      logs.push(auditLog);

      // Keep only last 500 logs locally
      if (logs.length > 500) {
        logs.splice(0, logs.length - 500);
      }

      await AsyncStorage.setItem(this.AUDIT_STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
      console.error('Error storing audit log locally:', error);
    }
  }

  // Real-time monitoring
  static subscribeToSecurityAlerts(callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const alertsRef = collection(db, 'security_alerts');

      return onSnapshot(alertsRef, (snapshot) => {
        const alerts = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            alerts.push({ id: change.doc.id, ...change.doc.data() });
          }
        });
        if (alerts.length > 0) {
          callback(alerts);
        }
      });
    } catch (error) {
      console.error('Error subscribing to security alerts:', error);
      return null;
    }
  }

  static subscribeToAuditEvents(callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const auditRef = collection(db, 'audit_logs');

      return onSnapshot(auditRef, (snapshot) => {
        const events = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            events.push({ id: change.doc.id, ...change.doc.data() });
          }
        });
        if (events.length > 0) {
          callback(events);
        }
      });
    } catch (error) {
      console.error('Error subscribing to audit events:', error);
      return null;
    }
  }
}

export default AnalyticsManager;