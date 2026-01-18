# VLC Backend Integration Guide

This guide provides step-by-step instructions for integrating the VLC backend with your React Native Expo app.

## Overview

The integration adds two new features:
1. **Authentication Tokens**: Send JWT tokens via VLC for device authentication
2. **Configuration Sync**: Send configuration references via VLC, fetch full configs from backend

## Backend Setup

### 1. Firebase Project Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project called "vigil-edge"
3. Enable Firestore Database
4. Create a service account and download the key JSON

### 2. Backend Configuration
```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your Firebase credentials:
```env
FIREBASE_PROJECT_ID=vigil-edge
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40project.iam.gserviceaccount.com
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

### 3. Deploy Firestore Rules
```bash
firebase login
firebase use vigil-edge
firebase deploy --only firestore:rules
```

### 4. Add Sample Configs
In Firestore, add a document to `configs` collection:

**Document ID:** `device123`
```json
{
  "sampleRate": 44100,
  "threshold": 128,
  "powerMode": "balanced",
  "sensitivity": 0.8,
  "adaptiveThreshold": true,
  "compressionEnabled": true,
  "fecEnabled": true
}
```

### 5. Run Backend
```bash
npm start
```
Backend runs on `http://localhost:3000`

## React Native Integration

### 1. Update App.js
The main app now includes a "Backend" tab. The BackendManagerScreen is already integrated.

### 2. Backend URL Configuration
In the Backend Manager screen, set the backend URL to match your deployment:
- Local development: `http://localhost:3000`
- Production: `https://your-backend-url.com`

### 3. Device IDs
Configure device IDs in the Backend Manager:
- **Sender Device ID**: Your device's identifier (e.g., `device123`)
- **Receiver Device ID**: Target device's identifier (e.g., `device456`)

## Usage Examples

### Example Flow 1: Authentication
1. **Device A** (Sender):
   - Open Backend Manager
   - Set sender: `device123`, receiver: `device456`
   - Tap "Send Auth Token"
   - Point camera at **Device B**

2. **Device B** (Receiver):
   - Open Receiver screen
   - Start calibration
   - Point camera at **Device A**
   - Should see "Authentication Successful" alert

### Example Flow 2: Configuration Sync
1. **Device A** (Sender):
   - Open Backend Manager
   - Set Config ID: `config001`
   - Tap "Send Config"
   - Point camera at **Device B**

2. **Device B** (Receiver):
   - Should receive config and see "Configuration Received" alert
   - Config is fetched from backend and can be applied locally

## Payload Structure

### Authentication Payload
```
Mode: 01 (Auth)
Data: {
  "mode": "auth",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "senderDeviceId": "device123",
  "receiverDeviceId": "device456",
  "timestamp": 1640995200000
}
```

### Configuration Payload
```
Mode: 10 (Config)
Data: {
  "mode": "config",
  "configId": "config001",
  "deviceId": "device123",
  "timestamp": 1640995200000
}
```

## Testing

### 1. Backend Tests
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test auth challenge
curl -X POST http://localhost:3000/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"senderDeviceId":"device123","receiverDeviceId":"device456"}'

# Test config retrieval
curl http://localhost:3000/config/device123
```

### 2. Full Flow Test
1. Start backend server
2. Run React Native app on two devices/emulators
3. Test auth token exchange
4. Test config sync

## Deployment

### Backend Deployment
Choose one of the free hosting options:

#### Railway (Easiest)
1. Sign up at [Railway.app](https://railway.app)
2. Connect GitHub repository
3. Set environment variables
4. Deploy

#### Render
1. Sign up at [Render.com](https://render.com)
2. Create Web Service
3. Connect repository
4. Configure build/start commands
5. Add environment variables

### React Native Build
```bash
npx expo build:android
# or
npx expo build:ios
```

## Troubleshooting

### Backend Issues
- **Firebase connection fails**: Check service account credentials
- **JWT verification fails**: Ensure JWT_SECRET matches between requests
- **CORS errors**: Backend includes CORS headers for all origins

### React Native Issues
- **Network requests fail**: Check backend URL configuration
- **VLC transmission fails**: Ensure proper camera permissions and lighting
- **Payload not recognized**: Verify mode flags (01=auth, 10=config)

### Common Errors
- **"Token expired"**: Tokens expire after 2 minutes
- **"Config not found"**: Ensure config exists in Firestore
- **"Invalid token type"**: Only 'auth' type tokens are accepted

## Security Notes

- JWT tokens expire after 2 minutes
- Firestore rules currently allow all access (development mode)
- In production, implement proper authentication and access controls
- Store sensitive keys securely (not in version control)

## Architecture

```
React Native App
├── Backend Manager Screen
│   ├── PayloadBuilder (creates auth/config payloads)
│   └── VLC Encoder (sends via screen flash)
└── Receiver Screen
    ├── VLC Decoder (receives via camera)
    └── Backend API (verifies tokens, fetches configs)

Backend (Node.js + Express)
├── Auth endpoints (/auth/challenge, /auth/verify)
├── Config endpoint (/config/:deviceId)
├── Firebase Firestore (storage & logging)
└── JWT handling (token creation/verification)
```

## Files Modified/Added

### Backend
- `backend/server.js` - Main API server
- `backend/.env.example` - Environment variables template
- `backend/firestore.rules` - Firestore security rules
- `backend/package.json` - Dependencies
- `backend/README.md` - Backend documentation

### React Native
- `src/utils/payloadBuilder.js` - New payload creation utility
- `src/screens/BackendManagerScreen.js` - New backend management screen
- `src/App.js` - Updated with backend tab
- `src/decoder/decoder.js` - Enhanced with backend payload handling
- `src/screens/ReceiverScreen.js` - Updated to display backend results

## Next Steps

1. **Production Security**: Implement proper Firestore rules and authentication
2. **Error Handling**: Add retry logic for failed network requests
3. **UI Polish**: Improve backend result displays and error messages
4. **Performance**: Optimize VLC transmission for longer payloads
5. **Features**: Add more payload types (firmware updates, commands, etc.)