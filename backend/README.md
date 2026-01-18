# VLC Backend API

Node.js + Express backend for VLC authentication and configuration management.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure your `.env` file with Firebase credentials and JWT secret.

4. Deploy Firestore security rules:
```bash
firebase deploy --only firestore:rules
```

## Running Locally

```bash
npm start
```

Server will run on `http://localhost:3000`

## API Endpoints

### POST /auth/challenge
Issues a JWT token for sender/receiver authentication.

**Request Body:**
```json
{
  "senderDeviceId": "device123",
  "receiverDeviceId": "device456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": 1640995200000
}
```

### POST /auth/verify
Verifies a JWT token received via VLC.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token verified successfully",
  "senderDeviceId": "device123",
  "receiverDeviceId": "device456"
}
```

### GET /config/:deviceId
Retrieves device configuration.

**Response:**
```json
{
  "success": true,
  "config": {
    "sampleRate": 44100,
    "threshold": 128,
    "powerMode": "high",
    ...
  }
}
```

## Deployment

### Railway (Recommended)
1. Connect your GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically

### Render
1. Create a new Web Service
2. Connect your repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables

## Sample Configs

Add device configurations to Firestore `configs` collection:

```json
{
  "device123": {
    "sampleRate": 44100,
    "threshold": 128,
    "powerMode": "balanced",
    "sensitivity": 0.8,
    "adaptiveThreshold": true,
    "compressionEnabled": true,
    "fecEnabled": true
  }
}
```

## Security Rules

Firestore rules allow read/write access to `configs`, `events`, and `devices` collections for development. In production, implement proper authentication-based rules.