const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID || "vigil-edge",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || "vigil-edge"}.firebaseio.com`
});

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to log events
async function logEvent(action, data) {
  try {
    await db.collection('events').add({
      action,
      ...data,
      timestamp: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error('Failed to log event:', error);
  }
}

// POST /auth/challenge
// Issues JWT token for sender/receiver pair
app.post('/auth/challenge', async (req, res) => {
  try {
    const { senderDeviceId, receiverDeviceId } = req.body;

    if (!senderDeviceId || !receiverDeviceId) {
      return res.status(400).json({
        success: false,
        message: 'senderDeviceId and receiverDeviceId are required'
      });
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + (2 * 60 * 1000); // 2 minutes

    const tokenPayload = {
      senderDeviceId,
      receiverDeviceId,
      type: 'auth',
      issuedAt,
      expiresAt
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '2m' });

    // Log the challenge creation
    await logEvent('auth_challenge_created', {
      senderDeviceId,
      receiverDeviceId,
      tokenId: token.substring(0, 10) + '...'
    });

    res.json({
      success: true,
      token,
      expiresAt
    });
  } catch (error) {
    console.error('Auth challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /auth/verify
// Verifies JWT token
app.post('/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if it's an auth token
    if (decoded.type !== 'auth') {
      return res.status(400).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Check expiration
    if (Date.now() > decoded.expiresAt) {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    // Log successful verification
    await logEvent('auth_token_verified', {
      senderDeviceId: decoded.senderDeviceId,
      receiverDeviceId: decoded.receiverDeviceId,
      tokenId: token.substring(0, 10) + '...'
    });

    res.json({
      success: true,
      message: 'Token verified successfully',
      senderDeviceId: decoded.senderDeviceId,
      receiverDeviceId: decoded.receiverDeviceId
    });
  } catch (error) {
    console.error('Auth verify error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /config/:deviceId
// Returns device configuration
app.get('/config/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID is required'
      });
    }

    // Get config from Firestore
    const configDoc = await db.collection('configs').doc(deviceId).get();

    if (!configDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found for this device'
      });
    }

    const config = configDoc.data();

    // Log config access
    await logEvent('config_accessed', {
      deviceId,
      configId: configDoc.id
    });

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /pairing/verify-command
// Verifies signed command payload
app.post('/pairing/verify-command', async (req, res) => {
  try {
    const { signedCommand } = req.body;

    if (!signedCommand) {
      return res.status(400).json({
        success: false,
        message: 'signedCommand is required'
      });
    }

    // Basic validation of command structure
    const requiredFields = ['type', 'senderId', 'receiverId', 'command', 'nonce', 'expiresAt', 'signature'];
    for (const field of requiredFields) {
      if (!signedCommand[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Check if devices are paired
    const pairingId = [signedCommand.senderId, signedCommand.receiverId].sort().join('_');
    const pairingDoc = await db.collection('pairings').doc(pairingId).get();

    if (!pairingDoc.exists() || pairingDoc.data().status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Devices are not paired'
      });
    }

    // Check expiration
    if (Date.now() > signedCommand.expiresAt) {
      return res.status(401).json({
        success: false,
        message: 'Command expired'
      });
    }

    // Check for replay attack (simple check against recent commands)
    const recentCommands = await db.collection('command_logs')
      .where('nonce', '==', signedCommand.nonce)
      .where('senderId', '==', signedCommand.senderId)
      .limit(1)
      .get();

    if (!recentCommands.empty) {
      return res.status(403).json({
        success: false,
        message: 'Command already executed (replay attack)'
      });
    }

    // Log command verification
    await logEvent('command_verified', {
      senderId: signedCommand.senderId,
      receiverId: signedCommand.receiverId,
      command: signedCommand.command,
      nonce: signedCommand.nonce
    });

    res.json({
      success: true,
      message: 'Command verified successfully',
      command: signedCommand
    });
  } catch (error) {
    console.error('Command verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /pairing/status/:deviceId
// Get pairing status for a device
app.get('/pairing/status/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID is required'
      });
    }

    // Get pairings where this device is involved
    const pairingsRef = db.collection('pairings');
    const pairingsQuery = pairingsRef.where('devices', 'array-contains', deviceId);
    const pairingsSnapshot = await pairingsQuery.get();

    const pairedDevices = [];
    pairingsSnapshot.forEach(doc => {
      const pairing = doc.data();
      if (pairing.status === 'active') {
        const otherDevice = pairing.devices.find(id => id !== deviceId);
        if (otherDevice) {
          pairedDevices.push({
            deviceId: otherDevice,
            pairedAt: pairing.establishedAt,
            lastActivity: pairing.lastActivity
          });
        }
      }
    });

    res.json({
      success: true,
      deviceId,
      pairedDevices,
      pairingCount: pairedDevices.length
    });
  } catch (error) {
    console.error('Pairing status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /pairing/revoke
// Revoke pairing between devices
app.post('/pairing/revoke', async (req, res) => {
  try {
    const { deviceId1, deviceId2 } = req.body;

    if (!deviceId1 || !deviceId2) {
      return res.status(400).json({
        success: false,
        message: 'Both deviceId1 and deviceId2 are required'
      });
    }

    const pairingId = [deviceId1, deviceId2].sort().join('_');
    const pairingRef = db.collection('pairings').doc(pairingId);

    await pairingRef.update({
      status: 'revoked',
      revokedAt: admin.firestore.Timestamp.now()
    });

    await logEvent('pairing_revoked', {
      deviceId1,
      deviceId2
    });

    res.json({
      success: true,
      message: 'Pairing revoked successfully'
    });
  } catch (error) {
    console.error('Pairing revoke error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /command/log
// Log command execution (called after successful verification)
app.post('/command/log', async (req, res) => {
  try {
    const { senderId, receiverId, command, nonce, result } = req.body;

    await db.collection('command_logs').add({
      senderId,
      receiverId,
      command,
      nonce,
      result,
      executedAt: admin.firestore.Timestamp.now()
    });

    res.json({
      success: true,
      message: 'Command logged successfully'
    });
  } catch (error) {
    console.error('Command log error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;