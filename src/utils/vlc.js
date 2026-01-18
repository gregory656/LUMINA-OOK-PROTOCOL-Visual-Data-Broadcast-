import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { getFirebaseApp } from './device.js';
import { DeviceManager } from './device.js';
import { VLCConfig } from '../types';

export class VLCManager {
  static CONFIG_STORAGE_KEY = 'vlc_config';
  static METRICS_STORAGE_KEY = 'vlc_metrics';

  // Default VLC configuration
  static DEFAULT_CONFIG = {
    transmissionSpeed: 100, // bits per second
    errorCorrectionLevel: 2, // 0-5 (higher = more correction)
    rangeOptimization: true,
    adaptiveBrightness: true,
    multiChannelEnabled: false,
    compressionEnabled: true,
    adaptiveTransmission: true,
    qualityMonitoring: true,
    interferenceCompensation: true,
    batteryOptimization: true
  };

  // Get VLC configuration
  static async getVLCConfig() {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const configRef = doc(db, 'vlc_configs', deviceId);
      const configDoc = await getDoc(configRef);

      if (configDoc.exists()) {
        return { ...this.DEFAULT_CONFIG, ...configDoc.data() };
      }

      // Create default config
      const defaultConfig = {
        ...this.DEFAULT_CONFIG,
        deviceId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(configRef, defaultConfig);
      return defaultConfig;
    } catch (error) {
      console.error('Error getting VLC config:', error);
      return this.DEFAULT_CONFIG;
    }
  }

  // Update VLC configuration
  static async updateVLCConfig(updates) {
    try {
      const deviceId = await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const configRef = doc(db, 'vlc_configs', deviceId);
      await updateDoc(configRef, {
        ...updates,
        updatedAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error updating VLC config:', error);
      return false;
    }
  }

  // Adaptive transmission speed
  static async optimizeTransmissionSpeed(distance, ambientLight, targetDeviceId) {
    try {
      const config = await this.getVLCConfig();
      if (!config.adaptiveTransmission) {
        return config.transmissionSpeed;
      }

      let optimalSpeed = config.transmissionSpeed;

      // Adjust for distance (shorter distance = higher speed)
      if (distance < 1) optimalSpeed *= 1.5; // Very close
      else if (distance < 3) optimalSpeed *= 1.2; // Close
      else if (distance > 10) optimalSpeed *= 0.7; // Far
      else if (distance > 15) optimalSpeed *= 0.5; // Very far

      // Adjust for ambient light (more light = interference)
      if (ambientLight > 500) optimalSpeed *= 0.8; // Bright environment
      else if (ambientLight > 200) optimalSpeed *= 0.9; // Moderate light
      else if (ambientLight < 50) optimalSpeed *= 1.3; // Dark environment

      // Ensure speed is within reasonable bounds
      optimalSpeed = Math.max(50, Math.min(500, optimalSpeed));

      // Store optimization data
      await this.logTransmissionOptimization(targetDeviceId, {
        originalSpeed: config.transmissionSpeed,
        optimalSpeed,
        distance,
        ambientLight,
        timestamp: new Date()
      });

      return Math.round(optimalSpeed);
    } catch (error) {
      console.error('Error optimizing transmission speed:', error);
      return config.transmissionSpeed;
    }
  }

  // Range optimization
  static async optimizeForRange(distance, config = null) {
    if (!config) config = await this.getVLCConfig();
    if (!config.rangeOptimization) return config;

    const optimizations = {
      brightness: 1.0,
      errorCorrection: config.errorCorrectionLevel,
      retries: 3,
      chunkSize: 1024
    };

    // Adjust based on distance
    if (distance < 2) {
      optimizations.brightness = 0.7; // Lower brightness for close range
      optimizations.errorCorrection = Math.max(0, config.errorCorrectionLevel - 1);
      optimizations.chunkSize = 2048; // Larger chunks for close range
    } else if (distance < 5) {
      optimizations.brightness = 0.9;
      optimizations.errorCorrection = config.errorCorrectionLevel;
      optimizations.chunkSize = 1024;
    } else if (distance < 10) {
      optimizations.brightness = 1.2; // Higher brightness for medium range
      optimizations.errorCorrection = Math.min(5, config.errorCorrectionLevel + 1);
      optimizations.retries = 5;
      optimizations.chunkSize = 512;
    } else {
      optimizations.brightness = 1.5; // Maximum brightness for long range
      optimizations.errorCorrection = 5; // Maximum error correction
      optimizations.retries = 8;
      optimizations.chunkSize = 256; // Smaller chunks for reliability
    }

    return optimizations;
  }

  // Multi-channel simultaneous transfer
  static async setupMultiChannelTransfer(channels = 3) {
    try {
      const config = await this.getVLCConfig();
      if (!config.multiChannelEnabled) {
        throw new Error('Multi-channel transfer not enabled');
      }

      const channelConfig = {
        channels: [],
        synchronizationOffset: 50, // ms between channel starts
        errorCorrectionPerChannel: config.errorCorrectionLevel,
        createdAt: new Date()
      };

      // Configure each channel
      for (let i = 0; i < channels; i++) {
        channelConfig.channels.push({
          id: `channel_${i}`,
          frequency: 380 + (i * 20), // Different frequencies for each channel
          brightness: 1.0 - (i * 0.1), // Slightly different brightness
          phase: i * 120, // 120-degree phase difference
          active: true
        });
      }

      return channelConfig;
    } catch (error) {
      console.error('Error setting up multi-channel transfer:', error);
      throw error;
    }
  }

  // Advanced error correction (Forward Error Correction)
  static async generateErrorCorrection(data, errorCorrectionLevel = 2) {
    try {
      // Simple Reed-Solomon-like error correction simulation
      const dataBytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        dataBytes[i] = data.charCodeAt(i);
      }

      // Generate parity bytes based on error correction level
      const parityBytes = new Uint8Array(errorCorrectionLevel * 2);
      for (let i = 0; i < parityBytes.length; i++) {
        parityBytes[i] = dataBytes.reduce((sum, byte) => sum ^ byte, 0) ^ i;
      }

      return {
        originalData: data,
        parityData: String.fromCharCode(...parityBytes),
        errorCorrectionLevel,
        canRecover: errorCorrectionLevel >= 2
      };
    } catch (error) {
      console.error('Error generating error correction:', error);
      return { originalData: data, parityData: '', errorCorrectionLevel: 0 };
    }
  }

  static async correctErrors(receivedData, parityData, errorCorrectionLevel) {
    try {
      if (errorCorrectionLevel === 0) return receivedData;

      // Simple error correction simulation
      const receivedBytes = new Uint8Array(receivedData.length);
      const parityBytes = new Uint8Array(parityData.length);

      for (let i = 0; i < receivedData.length; i++) {
        receivedBytes[i] = receivedData.charCodeAt(i);
      }
      for (let i = 0; i < parityData.length; i++) {
        parityBytes[i] = parityData.charCodeAt(i);
      }

      // Check for errors and attempt correction
      const expectedParity = receivedBytes.reduce((sum, byte) => sum ^ byte, 0);
      const receivedParity = parityBytes.reduce((sum, byte) => sum ^ byte, 0);

      if (expectedParity === receivedParity) {
        return receivedData; // No errors detected
      }

      // Attempt single error correction
      if (errorCorrectionLevel >= 2) {
        // Find the error location and correct it
        for (let i = 0; i < receivedBytes.length; i++) {
          const correctedByte = receivedBytes[i] ^ (expectedParity ^ receivedParity);
          receivedBytes[i] = correctedByte;
        }
      }

      return String.fromCharCode(...receivedBytes);
    } catch (error) {
      console.error('Error correcting errors:', error);
      return receivedData; // Return original data if correction fails
    }
  }

  // Automatic brightness adjustment
  static async adjustBrightnessForConditions(ambientLight, distance, currentBrightness = 1.0) {
    try {
      const config = await this.getVLCConfig();
      if (!config.adaptiveBrightness) {
        return currentBrightness;
      }

      let adjustedBrightness = currentBrightness;

      // Adjust for ambient light
      if (ambientLight < 50) {
        adjustedBrightness *= 1.5; // Dark environment - increase brightness
      } else if (ambientLight > 500) {
        adjustedBrightness *= 0.7; // Bright environment - decrease brightness
      }

      // Adjust for distance
      if (distance > 10) {
        adjustedBrightness *= 1.3; // Increase for longer distances
      } else if (distance < 2) {
        adjustedBrightness *= 0.8; // Decrease for close distances
      }

      // Ensure brightness is within safe limits
      adjustedBrightness = Math.max(0.3, Math.min(2.0, adjustedBrightness));

      return adjustedBrightness;
    } catch (error) {
      console.error('Error adjusting brightness:', error);
      return currentBrightness;
    }
  }

  // Transfer compression
  static async compressData(data, compressionLevel = 'medium') {
    try {
      const config = await this.getVLCConfig();
      if (!config.compressionEnabled) {
        return { compressed: data, compressionRatio: 1.0 };
      }

      // Simple run-length encoding compression simulation
      let compressed = '';
      let count = 1;

      for (let i = 1; i <= data.length; i++) {
        if (i < data.length && data[i] === data[i - 1]) {
          count++;
        } else {
          if (count > (compressionLevel === 'high' ? 2 : 3)) {
            compressed += `${count}${data[i - 1]}`;
          } else {
            compressed += data[i - 1].repeat(count);
          }
          count = 1;
        }
      }

      const compressionRatio = data.length / compressed.length;

      return {
        compressed,
        compressionRatio,
        originalSize: data.length,
        compressedSize: compressed.length
      };
    } catch (error) {
      console.error('Error compressing data:', error);
      return { compressed: data, compressionRatio: 1.0 };
    }
  }

  static async decompressData(compressedData) {
    try {
      // Simple decompression for run-length encoding
      let decompressed = '';
      let i = 0;

      while (i < compressedData.length) {
        // Check if this is a count + character pattern
        const match = compressedData.substring(i).match(/^(\d+)(.)/);
        if (match) {
          const count = parseInt(match[1]);
          const char = match[2];
          decompressed += char.repeat(count);
          i += match[0].length;
        } else {
          decompressed += compressedData[i];
          i++;
        }
      }

      return decompressed;
    } catch (error) {
      console.error('Error decompressing data:', error);
      return compressedData;
    }
  }

  // Quality monitoring and metrics
  static async monitorTransmissionQuality(sessionId, metrics) {
    try {
      const qualityData = {
        sessionId,
        timestamp: new Date(),
        bitErrorRate: metrics.bitErrorRate || 0,
        signalStrength: metrics.signalStrength || 0,
        transmissionSpeed: metrics.transmissionSpeed || 0,
        distance: metrics.distance || 0,
        ambientLight: metrics.ambientLight || 0,
        successRate: metrics.successRate || 1.0,
        retriesRequired: metrics.retriesRequired || 0,
        compressionRatio: metrics.compressionRatio || 1.0
      };

      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'vlc_quality_metrics')), qualityData);

      // Check if quality is degrading and trigger optimizations
      if (qualityData.bitErrorRate > 0.05 || qualityData.successRate < 0.8) {
        await this.triggerQualityOptimization(sessionId, qualityData);
      }

      return qualityData;
    } catch (error) {
      console.error('Error monitoring transmission quality:', error);
      return null;
    }
  }

  static async triggerQualityOptimization(sessionId, qualityData) {
    try {
      const optimizations = {
        sessionId,
        timestamp: new Date(),
        qualityIssues: [],
        recommendations: [],
        appliedOptimizations: []
      };

      // Analyze quality issues
      if (qualityData.bitErrorRate > 0.05) {
        optimizations.qualityIssues.push('High bit error rate');
        optimizations.recommendations.push('Increase error correction level');
        optimizations.appliedOptimizations.push('error_correction_increased');
      }

      if (qualityData.successRate < 0.8) {
        optimizations.qualityIssues.push('Low success rate');
        optimizations.recommendations.push('Reduce transmission speed');
        optimizations.appliedOptimizations.push('speed_reduced');
      }

      if (qualityData.distance > 10) {
        optimizations.qualityIssues.push('Long distance');
        optimizations.recommendations.push('Increase brightness');
        optimizations.appliedOptimizations.push('brightness_increased');
      }

      // Apply optimizations
      const deviceId = await DeviceManager.getDeviceId();
      for (const optimization of optimizations.appliedOptimizations) {
        await this.applyOptimization(optimization, qualityData);
      }

      // Log optimization
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'vlc_optimizations')), optimizations);

      return optimizations;
    } catch (error) {
      console.error('Error triggering quality optimization:', error);
      return null;
    }
  }

  static async applyOptimization(optimizationType, qualityData) {
    try {
      const config = await this.getVLCConfig();
      const updates = {};

      switch (optimizationType) {
        case 'error_correction_increased':
          updates.errorCorrectionLevel = Math.min(5, config.errorCorrectionLevel + 1);
          break;
        case 'speed_reduced':
          updates.transmissionSpeed = Math.max(50, config.transmissionSpeed * 0.8);
          break;
        case 'brightness_increased':
          // This would be applied to the camera flash in the actual implementation
          break;
      }

      if (Object.keys(updates).length > 0) {
        await this.updateVLCConfig(updates);
      }

      return true;
    } catch (error) {
      console.error('Error applying optimization:', error);
      return false;
    }
  }

  // Interference compensation
  static async compensateForInterference(signalStrength, interferencePattern) {
    try {
      const config = await this.getVLCConfig();
      if (!config.interferenceCompensation) {
        return { compensatedSignal: signalStrength, adjustments: [] };
      }

      const adjustments = [];
      let compensatedSignal = signalStrength;

      // Analyze interference pattern and apply compensation
      if (interferencePattern.type === 'flickering') {
        adjustments.push('frequency_adjustment');
        compensatedSignal *= 1.2;
      } else if (interferencePattern.type === 'ambient_light') {
        adjustments.push('brightness_compensation');
        compensatedSignal *= 1.1;
      } else if (interferencePattern.type === 'distance_variation') {
        adjustments.push('adaptive_range');
        compensatedSignal *= 0.9;
      }

      // Apply predictive compensation based on pattern analysis
      if (interferencePattern.frequency > 10) {
        adjustments.push('predictive_filtering');
        compensatedSignal *= 1.15;
      }

      return {
        compensatedSignal,
        adjustments,
        originalSignal: signalStrength,
        compensationFactor: compensatedSignal / signalStrength
      };
    } catch (error) {
      console.error('Error compensating for interference:', error);
      return { compensatedSignal: signalStrength, adjustments: [] };
    }
  }

  // Battery optimization
  static async optimizeForBattery(batteryLevel, transmissionDuration) {
    try {
      const config = await this.getVLCConfig();
      if (!config.batteryOptimization) {
        return config;
      }

      const optimizations = { ...config };

      // Adjust settings based on battery level
      if (batteryLevel < 20) {
        // Critical battery - aggressive optimization
        optimizations.transmissionSpeed *= 0.6;
        optimizations.adaptiveBrightness = false;
        optimizations.multiChannelEnabled = false;
        optimizations.compressionEnabled = true;
        optimizations.errorCorrectionLevel = Math.min(2, config.errorCorrectionLevel);
      } else if (batteryLevel < 50) {
        // Low battery - moderate optimization
        optimizations.transmissionSpeed *= 0.8;
        optimizations.multiChannelEnabled = false;
      }

      // Adjust based on transmission duration
      if (transmissionDuration > 300) { // 5 minutes
        optimizations.adaptiveTransmission = false;
        optimizations.qualityMonitoring = false;
      }

      return optimizations;
    } catch (error) {
      console.error('Error optimizing for battery:', error);
      return config;
    }
  }

  // Performance analytics
  static async getVLCPerformanceAnalytics(deviceId = null, periodDays = 7) {
    try {
      const targetDeviceId = deviceId || await DeviceManager.getDeviceId();
      const db = getFirestore(getFirebaseApp());

      const startDate = new Date(Date.now() - (periodDays * 24 * 60 * 60 * 1000));

      const metricsRef = collection(db, 'vlc_quality_metrics');
      const q = query(
        metricsRef,
        where('sessionId', '>=', targetDeviceId + '_'),
        where('timestamp', '>=', startDate)
      );

      const querySnapshot = await getDocs(q);
      const analytics = {
        totalTransmissions: 0,
        averageBitErrorRate: 0,
        averageSignalStrength: 0,
        averageTransmissionSpeed: 0,
        averageSuccessRate: 0,
        totalOptimizations: 0,
        performanceTrend: [],
        periodDays
      };

      let totalBitErrorRate = 0;
      let totalSignalStrength = 0;
      let totalSpeed = 0;
      let totalSuccessRate = 0;

      querySnapshot.forEach((doc) => {
        const metric = doc.data();
        analytics.totalTransmissions++;
        totalBitErrorRate += metric.bitErrorRate || 0;
        totalSignalStrength += metric.signalStrength || 0;
        totalSpeed += metric.transmissionSpeed || 0;
        totalSuccessRate += metric.successRate || 1;

        analytics.performanceTrend.push({
          timestamp: metric.timestamp,
          successRate: metric.successRate,
          transmissionSpeed: metric.transmissionSpeed
        });
      });

      // Calculate averages
      if (analytics.totalTransmissions > 0) {
        analytics.averageBitErrorRate = totalBitErrorRate / analytics.totalTransmissions;
        analytics.averageSignalStrength = totalSignalStrength / analytics.totalTransmissions;
        analytics.averageTransmissionSpeed = totalSpeed / analytics.totalTransmissions;
        analytics.averageSuccessRate = totalSuccessRate / analytics.totalTransmissions;
      }

      // Get optimization count
      const optimizationsRef = collection(db, 'vlc_optimizations');
      const optQuery = query(
        optimizationsRef,
        where('sessionId', '>=', targetDeviceId + '_'),
        where('timestamp', '>=', startDate)
      );

      const optSnapshot = await getDocs(optQuery);
      analytics.totalOptimizations = optSnapshot.size;

      return analytics;
    } catch (error) {
      console.error('Error getting VLC performance analytics:', error);
      return null;
    }
  }

  // Helper methods
  static async logTransmissionOptimization(targetDeviceId, data) {
    try {
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(collection(db, 'vlc_optimization_logs')), {
        deviceId: await DeviceManager.getDeviceId(),
        targetDeviceId,
        ...data
      });
    } catch (error) {
      console.error('Error logging transmission optimization:', error);
    }
  }

  // Real-time VLC monitoring
  static subscribeToVLCMetrics(callback) {
    try {
      const db = getFirestore(getFirebaseApp());
      const metricsRef = collection(db, 'vlc_quality_metrics');

      return onSnapshot(metricsRef, (snapshot) => {
        const changes = [];
        snapshot.docChanges().forEach((change) => {
          changes.push({
            type: change.type,
            metric: { id: change.doc.id, ...change.doc.data() }
          });
        });
        callback(changes);
      });
    } catch (error) {
      console.error('Error subscribing to VLC metrics:', error);
      return null;
    }
  }

  // Diagnostic tools
  static async runVLCDiagnostics() {
    try {
      const diagnostics = {
        timestamp: new Date(),
        cameraAvailable: false,
        flashSupported: false,
        ambientLightLevel: 0,
        recommendedSettings: {},
        issues: []
      };

      // Check camera and flash availability
      // Note: Actual implementation would use expo-camera to check capabilities

      // Analyze current configuration
      const config = await this.getVLCConfig();
      diagnostics.recommendedSettings = config;

      // Check for potential issues
      if (config.transmissionSpeed > 200) {
        diagnostics.issues.push('High transmission speed may cause reliability issues');
      }

      if (config.errorCorrectionLevel === 0) {
        diagnostics.issues.push('No error correction enabled - may experience data loss');
      }

      return diagnostics;
    } catch (error) {
      console.error('Error running VLC diagnostics:', error);
      return { timestamp: new Date(), issues: ['Failed to run diagnostics'] };
    }
  }
}

export default VLCManager;