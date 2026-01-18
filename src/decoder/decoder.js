import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateParity } from '../utils/parity.js';
import { calculateLuma, getBitFromBrightness } from '../utils/luma.js';
import { calculateThreshold } from '../utils/calibration.js';
import { parsePacket, PACKET_CONSTANTS, DATA_TYPES, getDataTypeName, reassembleChunks, decompressData, PACKET_FLAGS, fecEncoder } from '../utils/packet.js';
import { calculateBitErrorRate, calculateSNR, calculatePacketConfidence, aggregateMetrics } from '../utils/metrics.js';

// VLC Protocol Constants (legacy support)
const START_FRAME = '11111111';
const END_FRAME = '00000000';
const BIT_DURATION = 100; // 100ms per bit

// Receiver State Machine
export const RECEIVER_STATES = {
  IDLE: 'IDLE',
  CALIBRATING: 'CALIBRATING',
  WAITING_FOR_START: 'WAITING_FOR_START',
  RECEIVING: 'RECEIVING',
  END_DETECTED: 'END_DETECTED',
  PARITY_CHECK: 'PARITY_CHECK',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
};

// Decoder class
export class VLCDecoder {
  constructor() {
    this.state = RECEIVER_STATES.IDLE;
    this.threshold = 128;
    this.receivedBits = [];
    this.receivedBytes = [];
    this.bitBuffer = '';
    this.lastBitTime = 0;
    this.startTime = 0;
    // New packet format support
    this.receivedPackets = [];
    this.pendingChunks = new Map(); // For chunked data reassembly
    this.packetMode = false; // Toggle between legacy and packet modes
    // Quality metrics tracking
    this.brightnessSamples = []; // Store brightness samples during transmission
    this.metricsHistory = []; // Store computed metrics
  }

  // Process brightness sample
  processBrightness(brightness) {
    const bit = getBitFromBrightness(brightness, this.threshold);

    // Collect brightness samples during transmission for metrics
    if (this.state === RECEIVER_STATES.RECEIVING) {
      this.brightnessSamples.push(brightness);
    }

    switch (this.state) {
      case RECEIVER_STATES.CALIBRATING:
      case RECEIVER_STATES.WAITING_FOR_START:
        this.bitBuffer += bit;
        if (this.bitBuffer.length >= 8) {
          if (this.bitBuffer === START_FRAME) {
            this.state = RECEIVER_STATES.RECEIVING;
            this.receivedBits = [];
            this.brightnessSamples = []; // Start collecting samples
            this.startTime = Date.now();
            console.log('Start frame detected');
          }
          this.bitBuffer = this.bitBuffer.slice(1);
        }
        break;

      case RECEIVER_STATES.RECEIVING:
        this.receivedBits.push(bit);
        if (this.receivedBits.length >= 8) {
          const byteStr = this.receivedBits.slice(-8).join('');
          if (byteStr === END_FRAME) {
            this.state = RECEIVER_STATES.END_DETECTED;
            this.receivedBytes = this.groupBitsToBytes(this.receivedBits.slice(0, -8));
            console.log('End frame detected');
          }
        }
        break;
    }
  }

  // Group bits into 9-bit bytes (8 data + 1 parity)
  groupBitsToBytes(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 9) {
      if (i + 9 <= bits.length) {
        bytes.push(bits.slice(i, i + 9).join(''));
      }
    }
    return bytes;
  }

  // Validate parity and decode message
  async decodeMessage() {
    if (this.state !== RECEIVER_STATES.END_DETECTED) return null;

    this.state = RECEIVER_STATES.PARITY_CHECK;

    const validBytes = [];
    for (const byteStr of this.receivedBytes) {
      if (validateParity(byteStr)) {
        // Remove parity bit and convert to ASCII
        const dataBits = byteStr.slice(0, 8);
        const charCode = parseInt(dataBits, 2);
        validBytes.push(String.fromCharCode(charCode));
      } else {
        console.log('Parity error in byte:', byteStr);
        this.state = RECEIVER_STATES.ERROR;
        return null;
      }
    }

    const message = validBytes.join('');
    this.state = RECEIVER_STATES.SUCCESS;

    // Compute and save quality metrics
    await this.computeAndSaveMetrics();

    // Save to AsyncStorage
    try {
      const existing = await AsyncStorage.getItem('vlc_messages');
      const messages = existing ? JSON.parse(existing) : [];
      messages.push({
        message,
        timestamp: Date.now(),
        duration: Date.now() - this.startTime
      });
      await AsyncStorage.setItem('vlc_messages', JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save message:', error);
    }

    return message;
  }

  // Reset decoder
  reset() {
    this.state = RECEIVER_STATES.IDLE;
    this.receivedBits = [];
    this.receivedBytes = [];
    this.bitBuffer = '';
    this.brightnessSamples = [];
  }

  // Start calibration
  startCalibration() {
    this.state = RECEIVER_STATES.CALIBRATING;
    this.calibrationSamples = [];
  }

  // Add calibration sample
  addCalibrationSample(brightness) {
    if (this.state === RECEIVER_STATES.CALIBRATING) {
      this.calibrationSamples.push(brightness);
    }
  }

  // Finish calibration
  finishCalibration() {
    if (this.state === RECEIVER_STATES.CALIBRATING && this.calibrationSamples.length > 0) {
      this.threshold = calculateThreshold(this.calibrationSamples);
      this.state = RECEIVER_STATES.WAITING_FOR_START;
      console.log('Calibration complete, threshold:', this.threshold);
    }
  }

  // Enable packet mode (new format)
  enablePacketMode() {
    this.packetMode = true;
  }

  // Disable packet mode (legacy format)
  disablePacketMode() {
    this.packetMode = false;
  }

  // Process brightness sample for packet mode
  processBrightnessPacket(brightness) {
    const bit = getBitFromBrightness(brightness, this.threshold);
    this.receivedBits.push(bit);
    this.brightnessSamples.push(brightness); // Collect samples for metrics

    // Try to parse packet when we have enough bits
    if (this.receivedBits.length >= 64) { // Minimum packet size
      const packet = parsePacket(this.receivedBits);
      if (packet.valid) {
        this.handleReceivedPacket(packet);
        this.receivedBits = []; // Clear buffer after successful parse
        this.brightnessSamples = []; // Clear samples after processing
      } else if (this.receivedBits.length > 1024) { // Prevent buffer overflow
        this.receivedBits = this.receivedBits.slice(-512); // Keep last 512 bits
        this.brightnessSamples = this.brightnessSamples.slice(-512); // Keep corresponding samples
      }
    }
  }

  // Handle received packet
  handleReceivedPacket(packet) {
    const dataType = getDataTypeName(packet.type);

    try {
      let data = packet.payload;
      let isChunked = false;
      let chunkInfo = null;
      let compressionInfo = null;
      let fecInfo = null;

      // Check flags
      const isCompressed = (packet.flags & PACKET_FLAGS.COMPRESSED) !== 0;
      const isFECEnabled = (packet.flags & PACKET_FLAGS.FEC_ENABLED) !== 0;

      // Check if this is chunked data
      try {
        const parsed = JSON.parse(packet.payload);
        if (parsed.sequence !== undefined && parsed.total !== undefined && parsed.data !== undefined) {
          isChunked = true;
          chunkInfo = parsed;
          data = parsed.data;
          compressionInfo = parsed.compressionInfo;
          fecInfo = parsed.fecInfo;
        } else if (parsed.data && parsed.fec) {
          // Single packet with FEC
          data = parsed.data;
          fecInfo = parsed.fec;
        }
      } catch (e) {
        // Not chunked, use payload as-is
      }

      // Apply FEC error correction if enabled
      if (isFECEnabled && fecInfo) {
        const fecResult = fecEncoder.decode(fecInfo);
        if (fecResult.success) {
          data = fecResult.data;
          console.log(`FEC corrected ${fecResult.errorsCorrected} errors`);
        } else {
          console.warn('FEC decoding failed');
        }
      }

      // Decompress data if compressed
      if (isCompressed && !isChunked) {
        data = decompressData(data, { compressed: true });
      }

      if (isChunked) {
        this.handleChunkedPacket(packet.type, chunkInfo, data, compressionInfo);
      } else {
        this.handleCompletePacket(packet.type, data);
      }
    } catch (error) {
      console.error('Error processing packet:', error);
      this.state = RECEIVER_STATES.ERROR;
    }
  }

  // Handle chunked packet
  handleChunkedPacket(type, chunkInfo, data, compressionInfo) {
    const key = `${type}_${Date.now()}`; // Unique key for this transmission

    if (!this.pendingChunks.has(key)) {
      this.pendingChunks.set(key, []);
    }

    const chunks = this.pendingChunks.get(key);
    chunks.push(chunkInfo);

    // Try to reassemble if we have all chunks
    const reassembled = reassembleChunks(chunks);
    if (reassembled !== null) {
      // Decompress if needed
      let finalData = reassembled;
      if (compressionInfo) {
        finalData = decompressData(reassembled, { compressed: true });
      }
      this.handleCompletePacket(type, finalData);
      this.pendingChunks.delete(key);
    }
  }

  // Handle complete packet
  async handleCompletePacket(type, data) {
    let processedData;
    const dataType = getDataTypeName(type);

    // Check if this is a backend payload (auth, config, or command)
    if (type === DATA_TYPES.JSON) {
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.mode === 'auth' || jsonData.mode === 'config' || jsonData.mode === 'command') {
          await this.handleBackendPayload(jsonData);
          return; // Don't save as regular data
        }
      } catch (e) {
        // Not a backend payload, continue with normal processing
      }
    }

    // Process data based on type
    switch (type) {
      case DATA_TYPES.TEXT:
        processedData = data;
        break;
      case DATA_TYPES.JSON:
        try {
          processedData = JSON.parse(data);
        } catch (e) {
          processedData = data; // Fallback to string
        }
        break;
      case DATA_TYPES.FILE:
      case DATA_TYPES.IMAGE:
        processedData = data; // Base64 data
        break;
      case DATA_TYPES.SENSOR_DATA:
        try {
          processedData = JSON.parse(data);
        } catch (e) {
          processedData = data;
        }
        break;
      default:
        processedData = data;
    }

    this.state = RECEIVER_STATES.SUCCESS;

    // Compute and save quality metrics
    await this.computeAndSaveMetrics();

    // Save to AsyncStorage with enhanced metadata
    try {
      const existing = await AsyncStorage.getItem('vlc_data');
      const dataHistory = existing ? JSON.parse(existing) : [];
      dataHistory.push({
        type: dataType,
        data: processedData,
        timestamp: Date.now(),
        duration: Date.now() - this.startTime,
        size: JSON.stringify(processedData).length
      });
      await AsyncStorage.setItem('vlc_data', JSON.stringify(dataHistory));
    } catch (error) {
      console.error('Failed to save data:', error);
    }

    // Also save to legacy messages for backward compatibility
    if (type === DATA_TYPES.TEXT) {
      try {
        const existing = await AsyncStorage.getItem('vlc_messages');
        const messages = existing ? JSON.parse(existing) : [];
        messages.push({
          message: processedData,
          timestamp: Date.now(),
          duration: Date.now() - this.startTime
        });
        await AsyncStorage.setItem('vlc_messages', JSON.stringify(messages));
      } catch (error) {
        console.error('Failed to save legacy message:', error);
      }
    }
  }

  // Compute and save transmission quality metrics
  async computeAndSaveMetrics() {
    if (this.brightnessSamples.length === 0) return;

    const totalBits = this.receivedBits.length;
    const ber = calculateBitErrorRate(this.receivedBytes, totalBits);
    const snr = calculateSNR(this.brightnessSamples);
    const confidence = calculatePacketConfidence(1, 1); // Single transmission success

    const metrics = {
      ber: ber * 100, // Convert to percentage
      snr: snr,
      confidence: confidence,
      timestamp: Date.now(),
      totalBits: totalBits,
      sampleCount: this.brightnessSamples.length
    };

    this.metricsHistory.push(metrics);

    // Save to AsyncStorage
    try {
      const existing = await AsyncStorage.getItem('vlc_metrics');
      const metricsHistory = existing ? JSON.parse(existing) : [];
      metricsHistory.push(metrics);
      // Keep only last 100 entries
      if (metricsHistory.length > 100) {
        metricsHistory.splice(0, metricsHistory.length - 100);
      }
      await AsyncStorage.setItem('vlc_metrics', JSON.stringify(metricsHistory));
    } catch (error) {
      console.error('Failed to save metrics:', error);
    }
  }

  // Handle backend payload (auth, config, or command)
  async handleBackendPayload(payloadData) {
    try {
      // Import payloadBuilder dynamically to avoid circular dependency
      const { payloadBuilder } = await import('../utils/payloadBuilder.js');

      this.state = RECEIVER_STATES.SUCCESS;

      if (payloadData.mode === 'auth') {
        console.log('Received auth payload, verifying token...');

        // Verify the auth token with backend
        const result = await payloadBuilder.processAuthPayload(payloadData);

        // Save auth result to AsyncStorage
        const authResult = {
          type: 'AUTH_VERIFICATION',
          data: {
            senderDeviceId: payloadData.senderDeviceId,
            receiverDeviceId: payloadData.receiverDeviceId,
            success: result.success,
            message: result.message,
            timestamp: Date.now()
          },
          timestamp: Date.now(),
          duration: Date.now() - this.startTime,
          size: JSON.stringify(payloadData).length
        };

        try {
          const existing = await AsyncStorage.getItem('vlc_backend_data');
          const backendHistory = existing ? JSON.parse(existing) : [];
          backendHistory.push(authResult);
          await AsyncStorage.setItem('vlc_backend_data', JSON.stringify(backendHistory));
        } catch (error) {
          console.error('Failed to save auth result:', error);
        }

        // Emit event for UI update
        if (this.onBackendPayload) {
          this.onBackendPayload(authResult);
        }

      } else if (payloadData.mode === 'config') {
        console.log('Received config payload, fetching config...');

        // Fetch the config from backend
        const result = await payloadBuilder.processConfigPayload(payloadData);

        // Save config result to AsyncStorage
        const configResult = {
          type: 'CONFIG_RECEIVED',
          data: {
            deviceId: payloadData.deviceId,
            configId: payloadData.configId,
            success: result.success,
            config: result.config,
            message: result.message,
            timestamp: Date.now()
          },
          timestamp: Date.now(),
          duration: Date.now() - this.startTime,
          size: JSON.stringify(payloadData).length
        };

        try {
          const existing = await AsyncStorage.getItem('vlc_backend_data');
          const backendHistory = existing ? JSON.parse(existing) : [];
          backendHistory.push(configResult);
          await AsyncStorage.setItem('vlc_backend_data', JSON.stringify(backendHistory));
        } catch (error) {
          console.error('Failed to save config result:', error);
        }

        // Emit event for UI update
        if (this.onBackendPayload) {
          this.onBackendPayload(configResult);
        }

      } else if (payloadData.mode === 'command') {
        console.log('Received command payload, verifying and executing...');

        // Import PairingManager dynamically to avoid circular dependency
        const { PairingManager } = await import('../utils/pairing.js');

        // Verify and execute the command
        const result = await PairingManager.verifyAndExecuteCommand(payloadData.signedCommand);

        // Save command result to AsyncStorage
        const commandResult = {
          type: 'COMMAND_EXECUTION',
          data: {
            senderId: payloadData.signedCommand.senderId,
            receiverId: payloadData.signedCommand.receiverId,
            command: payloadData.signedCommand.command,
            success: result.success,
            result: result.result,
            error: result.error,
            timestamp: Date.now()
          },
          timestamp: Date.now(),
          duration: Date.now() - this.startTime,
          size: JSON.stringify(payloadData).length
        };

        try {
          const existing = await AsyncStorage.getItem('vlc_backend_data');
          const backendHistory = existing ? JSON.parse(existing) : [];
          backendHistory.push(commandResult);
          await AsyncStorage.setItem('vlc_backend_data', JSON.stringify(backendHistory));
        } catch (error) {
          console.error('Failed to save command result:', error);
        }

        // Emit event for UI update
        if (this.onBackendPayload) {
          this.onBackendPayload(commandResult);
        }
      }

      // Compute and save quality metrics
      await this.computeAndSaveMetrics();

    } catch (error) {
      console.error('Error handling backend payload:', error);
      this.state = RECEIVER_STATES.ERROR;

      // Save error result
      const errorResult = {
        type: 'BACKEND_ERROR',
        data: {
          payload: payloadData,
          error: error.message,
          timestamp: Date.now()
        },
        timestamp: Date.now(),
        duration: Date.now() - this.startTime,
        size: JSON.stringify(payloadData).length
      };

      try {
        const existing = await AsyncStorage.getItem('vlc_backend_data');
        const backendHistory = existing ? JSON.parse(existing) : [];
        backendHistory.push(errorResult);
        await AsyncStorage.setItem('vlc_backend_data', JSON.stringify(backendHistory));
      } catch (saveError) {
        console.error('Failed to save error result:', saveError);
      }
    }
  }

  // Set callback for backend payload events
  setBackendPayloadCallback(callback) {
    this.onBackendPayload = callback;
  }

  // Get transmission statistics
  getStats() {
    return {
      packetMode: this.packetMode,
      threshold: this.threshold,
      pendingChunks: this.pendingChunks.size,
      state: this.state
    };
  }
}