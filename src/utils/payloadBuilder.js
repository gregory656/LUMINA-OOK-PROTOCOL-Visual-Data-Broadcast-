import { encodeData } from '../encoder/encoder.js';
import { DATA_TYPES, PACKET_FLAGS } from './packet.js';

// Payload mode flags (2 bits prefix)
export const PAYLOAD_MODES = {
  AUTH: '01',      // Authentication token
  CONFIG: '10',    // Configuration reference
  COMMAND: '11',   // Signed command payload
  LEGACY: '00',    // Legacy data (backward compatibility)
};

// PayloadBuilder class for creating structured VLC payloads
export class PayloadBuilder {
  constructor() {
    this.backendUrl = 'http://localhost:3000'; // Default, can be configured
  }

  // Set backend URL for API calls
  setBackendUrl(url) {
    this.backendUrl = url;
  }

  // Build auth payload for VLC transmission
  async buildAuthPayload(senderDeviceId, receiverDeviceId) {
    try {
      // Request auth token from backend
      const response = await fetch(`${this.backendUrl}/auth/challenge`, {
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

      if (!result.success) {
        throw new Error(result.message || 'Failed to get auth token');
      }

      // Create payload structure: MODE_FLAG + JWT_TOKEN
      const modeFlag = PAYLOAD_MODES.AUTH;
      const payloadData = {
        mode: 'auth',
        token: result.token,
        senderDeviceId,
        receiverDeviceId,
        timestamp: Date.now()
      };

      return {
        mode: PAYLOAD_MODES.AUTH,
        data: payloadData,
        encoded: this.encodePayload(modeFlag, JSON.stringify(payloadData))
      };
    } catch (error) {
      console.error('Failed to build auth payload:', error);
      throw error;
    }
  }

  // Build config payload for VLC transmission
  async buildConfigPayload(deviceId, configId) {
    try {
      // For now, just send the configId - receiver will fetch full config
      // In future, could fetch config here and send it directly
      const payloadData = {
        mode: 'config',
        configId: configId,
        deviceId: deviceId,
        timestamp: Date.now()
      };

      // Create payload structure: MODE_FLAG + CONFIG_REFERENCE
      const modeFlag = PAYLOAD_MODES.CONFIG;

      return {
        mode: PAYLOAD_MODES.CONFIG,
        data: payloadData,
        encoded: this.encodePayload(modeFlag, JSON.stringify(payloadData))
      };
    } catch (error) {
      console.error('Failed to build config payload:', error);
      throw error;
    }
  }

  // Build command payload for VLC transmission
  async buildCommandPayload(signedCommand) {
    try {
      const payloadData = {
        mode: 'command',
        signedCommand: signedCommand,
        timestamp: Date.now()
      };

      // Create payload structure: MODE_FLAG + SIGNED_COMMAND
      const modeFlag = PAYLOAD_MODES.COMMAND;

      return {
        mode: PAYLOAD_MODES.COMMAND,
        data: payloadData,
        encoded: this.encodePayload(modeFlag, JSON.stringify(payloadData))
      };
    } catch (error) {
      console.error('Failed to build command payload:', error);
      throw error;
    }
  }

  // Encode payload with mode flag for VLC transmission
  encodePayload(modeFlag, payloadString) {
    // Combine mode flag with payload data
    const fullPayload = modeFlag + payloadString;

    // Use existing VLC encoding with custom data type
    return encodeData(fullPayload, DATA_TYPES.JSON, true, true); // Enable compression and FEC
  }

  // Parse received VLC payload and extract mode/data
  parseReceivedPayload(receivedData) {
    try {
      // receivedData should be the decoded JSON string from VLC
      const payloadStr = typeof receivedData === 'string' ? receivedData : JSON.stringify(receivedData);

      // Extract mode flag (first 2 characters)
      const modeFlag = payloadStr.substring(0, 2);
      const payloadData = payloadStr.substring(2);

      let parsedData;
      try {
        parsedData = JSON.parse(payloadData);
      } catch (e) {
        // If not JSON, treat as raw string
        parsedData = payloadData;
      }

      return {
        mode: modeFlag,
        data: parsedData,
        modeName: this.getModeName(modeFlag)
      };
    } catch (error) {
      console.error('Failed to parse received payload:', error);
      return null;
    }
  }

  // Get human-readable mode name
  getModeName(modeFlag) {
    switch (modeFlag) {
      case PAYLOAD_MODES.AUTH:
        return 'Authentication';
      case PAYLOAD_MODES.CONFIG:
        return 'Configuration';
      case PAYLOAD_MODES.COMMAND:
        return 'Command';
      case PAYLOAD_MODES.LEGACY:
        return 'Legacy Data';
      default:
        return 'Unknown';
    }
  }

  // Process auth payload (verify with backend)
  async processAuthPayload(payloadData) {
    try {
      const response = await fetch(`${this.backendUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: payloadData.token
        })
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to process auth payload:', error);
      return {
        success: false,
        message: 'Network error during verification'
      };
    }
  }

  // Process config payload (fetch config from backend)
  async processConfigPayload(payloadData) {
    try {
      const response = await fetch(`${this.backendUrl}/config/${payloadData.deviceId}`);

      const result = await response.json();

      if (result.success) {
        return {
          success: true,
          config: result.config,
          configId: payloadData.configId
        };
      } else {
        return {
          success: false,
          message: result.message
        };
      }
    } catch (error) {
      console.error('Failed to process config payload:', error);
      return {
        success: false,
        message: 'Network error during config fetch'
      };
    }
  }

  // Process command payload (verify with backend)
  async processCommandPayload(payloadData) {
    try {
      const response = await fetch(`${this.backendUrl}/pairing/verify-command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signedCommand: payloadData.signedCommand
        })
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to process command payload:', error);
      return {
        success: false,
        message: 'Network error during command verification'
      };
    }
  }
}

// Global instance
export const payloadBuilder = new PayloadBuilder();

// Example payload structures
export const EXAMPLE_PAYLOADS = {
  auth: {
    mode: '01',
    data: {
      mode: 'auth',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      senderDeviceId: 'device123',
      receiverDeviceId: 'device456',
      timestamp: Date.now()
    }
  },
  config: {
    mode: '10',
    data: {
      mode: 'config',
      configId: 'config001',
      deviceId: 'device123',
      timestamp: Date.now()
    }
  }
};