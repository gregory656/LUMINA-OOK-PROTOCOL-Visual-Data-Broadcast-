import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, writeBatch } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { CommandManager } from './command.js';
import { Asset, AttendanceRecord, VitalSigns, MedicationRecord } from '../types';

export class EnterpriseManager {
  static ASSETS_STORAGE_KEY = 'assets_cache';
  static ATTENDANCE_STORAGE_KEY = 'attendance_records';

  // Asset Management
  static async registerAsset(assetData) {
    try {
      const db = getFirestore(getFirebaseApp());
      const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const asset = {
        id: assetId,
        name: assetData.name,
        type: assetData.type,
        location: assetData.location,
        status: 'available',
        assignedTo: null,
        lastUpdated: new Date(),
        metadata: assetData.metadata || {},
        createdAt: new Date(),
        qrCode: assetId // Can be used for quick scanning
      };

      await setDoc(doc(db, 'assets', assetId), asset);

      // Log asset creation
      await setDoc(doc(collection(db, 'asset_logs')), {
        assetId,
        action: 'created',
        details: assetData,
        timestamp: new Date(),
        performedBy: await DeviceManager.getDeviceId()
      });

      return asset;
    } catch (error) {
      console.error('Error registering asset:', error);
      throw error;
    }
  }

  static async checkOutAsset(assetId, assigneeId, notes = '') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const assetRef = doc(db, 'assets', assetId);
      const assetDoc = await getDoc(assetRef);

      if (!assetDoc.exists()) {
        throw new Error('Asset not found');
      }

      const asset = assetDoc.data();

      if (asset.status !== 'available') {
        throw new Error('Asset is not available for checkout');
      }

      // Update asset status
      await updateDoc(assetRef, {
        status: 'checked_out',
        assignedTo: assigneeId,
        lastUpdated: new Date(),
        checkedOutAt: new Date(),
        checkedOutBy: deviceId
      });

      // Log checkout
      await setDoc(doc(collection(db, 'asset_logs')), {
        assetId,
        action: 'checked_out',
        assigneeId,
        notes,
        timestamp: new Date(),
        performedBy: deviceId
      });

      // Send command to assignee
      await CommandManager.sendCommand('asset_assigned', {
        assetId,
        assetName: asset.name,
        assigneeId
      }, assigneeId);

      return true;
    } catch (error) {
      console.error('Error checking out asset:', error);
      return false;
    }
  }

  static async checkInAsset(assetId, notes = '') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const assetRef = doc(db, 'assets', assetId);
      const assetDoc = await getDoc(assetRef);

      if (!assetDoc.exists()) {
        throw new Error('Asset not found');
      }

      const asset = assetDoc.data();

      if (asset.status !== 'checked_out') {
        throw new Error('Asset is not checked out');
      }

      // Update asset status
      await updateDoc(assetRef, {
        status: 'available',
        assignedTo: null,
        lastUpdated: new Date(),
        checkedInAt: new Date(),
        checkedInBy: deviceId
      });

      // Log checkin
      await setDoc(doc(collection(db, 'asset_logs')), {
        assetId,
        action: 'checked_in',
        previousAssignee: asset.assignedTo,
        notes,
        timestamp: new Date(),
        performedBy: deviceId
      });

      return true;
    } catch (error) {
      console.error('Error checking in asset:', error);
      return false;
    }
  }

  static async getAssetById(assetId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const assetDoc = await getDoc(doc(db, 'assets', assetId));

      if (assetDoc.exists()) {
        return { id: assetDoc.id, ...assetDoc.data() };
      }

      return null;
    } catch (error) {
      console.error('Error getting asset:', error);
      return null;
    }
  }

  static async getAssetsByLocation(location) {
    try {
      const db = getFirestore(getFirebaseApp());
      const assetsRef = collection(db, 'assets');
      const q = query(assetsRef, where('location', '==', location));

      const querySnapshot = await getDocs(q);
      const assets = [];

      querySnapshot.forEach((doc) => {
        assets.push({ id: doc.id, ...doc.data() });
      });

      return assets;
    } catch (error) {
      console.error('Error getting assets by location:', error);
      return [];
    }
  }

  static async getAssetsByAssignee(assigneeId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const assetsRef = collection(db, 'assets');
      const q = query(assetsRef, where('assignedTo', '==', assigneeId));

      const querySnapshot = await getDocs(q);
      const assets = [];

      querySnapshot.forEach((doc) => {
        assets.push({ id: doc.id, ...doc.data() });
      });

      return assets;
    } catch (error) {
      console.error('Error getting assets by assignee:', error);
      return [];
    }
  }

  static async updateAssetLocation(assetId, newLocation) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      await updateDoc(doc(db, 'assets', assetId), {
        location: newLocation,
        lastUpdated: new Date()
      });

      // Log location update
      await setDoc(doc(collection(db, 'asset_logs')), {
        assetId,
        action: 'location_updated',
        oldLocation: (await this.getAssetById(assetId)).location,
        newLocation,
        timestamp: new Date(),
        performedBy: deviceId
      });

      return true;
    } catch (error) {
      console.error('Error updating asset location:', error);
      return false;
    }
  }

  // Inventory Management
  static async updateInventoryItem(itemId, quantityChange, reason = '') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const itemRef = doc(db, 'inventory_items', itemId);
      const itemDoc = await getDoc(itemRef);

      if (!itemDoc.exists()) {
        throw new Error('Inventory item not found');
      }

      const item = itemDoc.data();
      const newQuantity = item.quantity + quantityChange;

      if (newQuantity < 0) {
        throw new Error('Insufficient inventory');
      }

      await updateDoc(itemRef, {
        quantity: newQuantity,
        lastUpdated: new Date()
      });

      // Log inventory change
      await setDoc(doc(collection(db, 'inventory_logs')), {
        itemId,
        action: 'quantity_updated',
        quantityChange,
        newQuantity,
        reason,
        timestamp: new Date(),
        performedBy: deviceId
      });

      return true;
    } catch (error) {
      console.error('Error updating inventory:', error);
      return false;
    }
  }

  static async getLowStockItems(threshold = 10) {
    try {
      const db = getFirestore(getFirebaseApp());
      const itemsRef = collection(db, 'inventory_items');
      const q = query(itemsRef, where('quantity', '<=', threshold));

      const querySnapshot = await getDocs(q);
      const items = [];

      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });

      return items;
    } catch (error) {
      console.error('Error getting low stock items:', error);
      return [];
    }
  }

  // Attendance Tracking
  static async recordAttendance(eventId, attendeeInfo, checkIn = true) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const attendanceId = `attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get current location if available
      const location = await CommandManager.getCurrentLocation();

      const attendance = {
        id: attendanceId,
        eventId,
        attendeeId: attendeeInfo.id,
        attendeeInfo,
        checkInTime: checkIn ? new Date() : null,
        checkOutTime: !checkIn ? new Date() : null,
        location,
        method: 'vlc',
        recordedBy: deviceId,
        timestamp: new Date()
      };

      await setDoc(doc(db, 'attendance_records', attendanceId), attendance);

      // Update event attendance count
      const eventRef = doc(db, 'events', eventId);
      const eventDoc = await getDoc(eventRef);

      if (eventDoc.exists()) {
        const event = eventDoc.data();
        const attendanceCount = (event.attendanceCount || 0) + 1;

        await updateDoc(eventRef, {
          attendanceCount,
          lastAttendanceUpdate: new Date()
        });
      }

      return attendance;
    } catch (error) {
      console.error('Error recording attendance:', error);
      throw error;
    }
  }

  static async getAttendanceForEvent(eventId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const attendanceRef = collection(db, 'attendance_records');
      const q = query(attendanceRef, where('eventId', '==', eventId));

      const querySnapshot = await getDocs(q);
      const records = [];

      querySnapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() });
      });

      return records;
    } catch (error) {
      console.error('Error getting attendance for event:', error);
      return [];
    }
  }

  static async checkOutAttendee(eventId, attendeeId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const attendanceRef = collection(db, 'attendance_records');
      const q = query(
        attendanceRef,
        where('eventId', '==', eventId),
        where('attendeeId', '==', attendeeId),
        where('checkOutTime', '==', null)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const attendanceDoc = querySnapshot.docs[0];
        await updateDoc(attendanceDoc.ref, {
          checkOutTime: new Date()
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking out attendee:', error);
      return false;
    }
  }

  // Access Control
  static async grantAccess(userId, resourceId, permissions, durationMinutes = 60) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const accessId = `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const access = {
        id: accessId,
        userId,
        resourceId,
        permissions,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + (durationMinutes * 60 * 1000)),
        grantedBy: deviceId,
        status: 'active'
      };

      await setDoc(doc(db, 'access_permissions', accessId), access);

      // Log access grant
      await setDoc(doc(collection(db, 'access_logs')), {
        accessId,
        action: 'granted',
        userId,
        resourceId,
        permissions,
        durationMinutes,
        timestamp: new Date(),
        performedBy: deviceId
      });

      return access;
    } catch (error) {
      console.error('Error granting access:', error);
      throw error;
    }
  }

  static async revokeAccess(accessId, reason = '') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const accessRef = doc(db, 'access_permissions', accessId);
      await updateDoc(accessRef, {
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: deviceId,
        revokeReason: reason
      });

      // Log access revocation
      await setDoc(doc(collection(db, 'access_logs')), {
        accessId,
        action: 'revoked',
        reason,
        timestamp: new Date(),
        performedBy: deviceId
      });

      return true;
    } catch (error) {
      console.error('Error revoking access:', error);
      return false;
    }
  }

  static async checkAccess(userId, resourceId, requiredPermission) {
    try {
      const db = getFirestore(getFirebaseApp());
      const accessRef = collection(db, 'access_permissions');
      const q = query(
        accessRef,
        where('userId', '==', userId),
        where('resourceId', '==', resourceId),
        where('status', '==', 'active')
      );

      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        const access = doc.data();

        // Check if expired
        if (access.expiresAt && new Date() > access.expiresAt.toDate()) {
          await this.revokeAccess(access.id, 'expired');
          continue;
        }

        // Check permissions
        if (access.permissions.includes(requiredPermission) || access.permissions.includes('*')) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking access:', error);
      return false;
    }
  }

  // Time Tracking
  static async startTimeTracking(employeeId, projectId, task = '') {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const trackingId = `time_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const timeEntry = {
        id: trackingId,
        employeeId,
        projectId,
        task,
        startTime: new Date(),
        endTime: null,
        duration: null,
        recordedBy: deviceId,
        status: 'active'
      };

      await setDoc(doc(db, 'time_entries', trackingId), timeEntry);

      return timeEntry;
    } catch (error) {
      console.error('Error starting time tracking:', error);
      throw error;
    }
  }

  static async stopTimeTracking(trackingId) {
    try {
      const db = getFirestore(getFirebaseApp());
      const timeRef = doc(db, 'time_entries', trackingId);
      const timeDoc = await getDoc(timeRef);

      if (!timeDoc.exists()) {
        throw new Error('Time tracking entry not found');
      }

      const timeEntry = timeDoc.data();
      const endTime = new Date();
      const duration = (endTime - timeEntry.startTime.toDate()) / 1000 / 60; // minutes

      await updateDoc(timeRef, {
        endTime,
        duration,
        status: 'completed'
      });

      return { ...timeEntry, endTime, duration };
    } catch (error) {
      console.error('Error stopping time tracking:', error);
      return null;
    }
  }

  static async getTimeEntriesForEmployee(employeeId, dateRange = null) {
    try {
      const db = getFirestore(getFirebaseApp());
      let q = query(
        collection(db, 'time_entries'),
        where('employeeId', '==', employeeId)
      );

      if (dateRange) {
        q = query(q, where('startTime', '>=', dateRange.start), where('startTime', '<=', dateRange.end));
      }

      const querySnapshot = await getDocs(q);
      const entries = [];

      querySnapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() });
      });

      return entries;
    } catch (error) {
      console.error('Error getting time entries:', error);
      return [];
    }
  }

  // Quality Control
  static async recordQualityCheck(itemId, checkData) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const checkId = `qc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const qualityCheck = {
        id: checkId,
        itemId,
        ...checkData,
        performedBy: deviceId,
        timestamp: new Date(),
        status: checkData.passed ? 'passed' : 'failed'
      };

      await setDoc(doc(db, 'quality_checks', checkId), qualityCheck);

      // Update item quality status
      const itemRef = doc(db, 'inventory_items', itemId);
      await updateDoc(itemRef, {
        lastQualityCheck: new Date(),
        qualityStatus: checkData.passed ? 'approved' : 'rejected',
        qualityCheckId: checkId
      });

      return qualityCheck;
    } catch (error) {
      console.error('Error recording quality check:', error);
      throw error;
    }
  }

  static async getQualityChecksForItem(itemId, limit = 10) {
    try {
      const db = getFirestore(getFirebaseApp());
      const checksRef = collection(db, 'quality_checks');
      const q = query(
        checksRef,
        where('itemId', '==', itemId),
        orderBy('timestamp', 'desc'),
        limit(limit)
      );

      const querySnapshot = await getDocs(q);
      const checks = [];

      querySnapshot.forEach((doc) => {
        checks.push({ id: doc.id, ...doc.data() });
      });

      return checks;
    } catch (error) {
      console.error('Error getting quality checks:', error);
      return [];
    }
  }

  // Healthcare Features
  static async recordVitalSigns(patientId, vitalSigns) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const recordId = `vitals_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const vitalsRecord = {
        id: recordId,
        patientId,
        timestamp: new Date(),
        recordedBy: deviceId,
        ...vitalSigns
      };

      await setDoc(doc(db, 'vital_signs', recordId), vitalsRecord);

      // Send to healthcare provider if configured
      const patientRef = doc(db, 'patients', patientId);
      const patientDoc = await getDoc(patientRef);

      if (patientDoc.exists()) {
        const patient = patientDoc.data();
        if (patient.healthcareProvider) {
          await CommandManager.sendCommand('vital_signs_update', {
            patientId,
            vitalsRecord
          }, patient.healthcareProvider);
        }
      }

      return vitalsRecord;
    } catch (error) {
      console.error('Error recording vital signs:', error);
      throw error;
    }
  }

  static async recordMedicationAdministration(patientId, medicationData) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const recordId = `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const medicationRecord = {
        id: recordId,
        patientId,
        ...medicationData,
        administeredBy: deviceId,
        timestamp: new Date(),
        verified: true
      };

      await setDoc(doc(db, 'medication_records', recordId), medicationRecord);

      // Send verification to healthcare provider
      const patientRef = doc(db, 'patients', patientId);
      const patientDoc = await getDoc(patientRef);

      if (patientDoc.exists()) {
        const patient = patientDoc.data();
        if (patient.healthcareProvider) {
          await CommandManager.sendCommand('medication_administered', {
            patientId,
            medicationRecord
          }, patient.healthcareProvider);
        }
      }

      return medicationRecord;
    } catch (error) {
      console.error('Error recording medication:', error);
      throw error;
    }
  }

  static async getPatientVitalSigns(patientId, limit = 20) {
    try {
      const db = getFirestore(getFirebaseApp());
      const vitalsRef = collection(db, 'vital_signs');
      const q = query(
        vitalsRef,
        where('patientId', '==', patientId),
        orderBy('timestamp', 'desc'),
        limit(limit)
      );

      const querySnapshot = await getDocs(q);
      const records = [];

      querySnapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() });
      });

      return records;
    } catch (error) {
      console.error('Error getting patient vital signs:', error);
      return [];
    }
  }

  static async sendEmergencyAlert(patientId, alertType, details) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const alert = {
        id: alertId,
        patientId,
        alertType,
        details,
        triggeredBy: deviceId,
        timestamp: new Date(),
        status: 'active',
        priority: 'critical'
      };

      await setDoc(doc(db, 'emergency_alerts', alertId), alert);

      // Get emergency contacts and healthcare providers
      const patientRef = doc(db, 'patients', patientId);
      const patientDoc = await getDoc(patientRef);

      if (patientDoc.exists()) {
        const patient = patientDoc.data();
        const recipients = [
          ...(patient.emergencyContacts || []),
          ...(patient.healthcareProvider ? [patient.healthcareProvider] : [])
        ];

        // Send alerts to all recipients
        for (const recipient of recipients) {
          await CommandManager.sendCommand('emergency_alert', {
            patientId,
            alert
          }, recipient);
        }
      }

      return alert;
    } catch (error) {
      console.error('Error sending emergency alert:', error);
      throw error;
    }
  }

  // Bulk operations
  static async bulkUpdateInventory(updates) {
    try {
      const db = getFirestore(getFirebaseApp());
      const batch = writeBatch(db);

      for (const update of updates) {
        const itemRef = doc(db, 'inventory_items', update.itemId);
        batch.update(itemRef, {
          quantity: update.newQuantity,
          lastUpdated: new Date()
        });

        // Log each update
        const logRef = doc(collection(db, 'inventory_logs'));
        batch.set(logRef, {
          itemId: update.itemId,
          action: 'bulk_update',
          quantityChange: update.quantityChange,
          newQuantity: update.newQuantity,
          reason: update.reason || 'bulk update',
          timestamp: new Date(),
          performedBy: await DeviceManager.getDeviceId()
        });
      }

      await batch.commit();
      return true;
    } catch (error) {
      console.error('Error performing bulk inventory update:', error);
      return false;
    }
  }

  // Reporting and Analytics
  static async generateAttendanceReport(eventId, dateRange = null) {
    try {
      const attendance = await this.getAttendanceForEvent(eventId);
      let filteredAttendance = attendance;

      if (dateRange) {
        filteredAttendance = attendance.filter(record =>
          record.checkInTime >= dateRange.start && record.checkInTime <= dateRange.end
        );
      }

      const report = {
        eventId,
        totalAttendees: filteredAttendance.length,
        checkedIn: filteredAttendance.filter(r => r.checkInTime).length,
        checkedOut: filteredAttendance.filter(r => r.checkOutTime).length,
        averageStayDuration: this.calculateAverageStayDuration(filteredAttendance),
        attendanceByTime: this.groupAttendanceByTime(filteredAttendance),
        generatedAt: new Date()
      };

      return report;
    } catch (error) {
      console.error('Error generating attendance report:', error);
      return null;
    }
  }

  static calculateAverageStayDuration(records) {
    const completedRecords = records.filter(r => r.checkInTime && r.checkOutTime);
    if (completedRecords.length === 0) return 0;

    const totalDuration = completedRecords.reduce((sum, record) => {
      return sum + (record.checkOutTime - record.checkInTime);
    }, 0);

    return totalDuration / completedRecords.length / 1000 / 60; // minutes
  }

  static groupAttendanceByTime(records) {
    const timeGroups = {};
    records.forEach(record => {
      if (record.checkInTime) {
        const hour = record.checkInTime.getHours();
        timeGroups[hour] = (timeGroups[hour] || 0) + 1;
      }
    });
    return timeGroups;
  }

  // Real-time subscriptions
  static subscribeToAssetUpdates(callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const assetsRef = collection(db, 'assets');

      return onSnapshot(assetsRef, (snapshot) => {
        const changes = [];
        snapshot.docChanges().forEach((change) => {
          changes.push({
            type: change.type,
            asset: { id: change.doc.id, ...change.doc.data() }
          });
        });
        callback(changes);
      });
    } catch (error) {
      console.error('Error subscribing to asset updates:', error);
      return null;
    }
  }

  static subscribeToAttendanceUpdates(eventId, callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const attendanceRef = collection(db, 'attendance_records');
      const q = query(attendanceRef, where('eventId', '==', eventId));

      return onSnapshot(q, (snapshot) => {
        const changes = [];
        snapshot.docChanges().forEach((change) => {
          changes.push({
            type: change.type,
            record: { id: change.doc.id, ...change.doc.data() }
          });
        });
        callback(changes);
      });
    } catch (error) {
      console.error('Error subscribing to attendance updates:', error);
      return null;
    }
  }
}

export default EnterpriseManager;