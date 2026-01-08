# LIGHTSYNC - Advanced Universal VLC Communication System

A cutting-edge, serverless Visual Light Communication (VLC) platform built with React Native and Expo. Transforms mobile devices into sophisticated communication terminals capable of transmitting arbitrary data types through light signals.

##  Project Overview

LIGHTSYNC represents the evolution from basic text messaging to universal data transmission via VLC. The system employs advanced packet-based protocols supporting multiple data types, with a futuristic UI designed for experimental communication research.

### Key Features
- **Universal Data Transmission**: Support for Text, JSON, Files, Images, and Sensor Data
- **Advanced Packet Protocol**: START|TYPE|LENGTH|PAYLOAD|CHECKSUM|END framing with CRC-16 validation
- **Chunked Transmission**: Automatic data segmentation for large payloads with reassembly
- **Futuristic UI**: Dark theme with neon accents, animated components, and advanced dashboards
- **Real-time Monitoring**: Live signal analysis, transmission progress, and integrity status
- **Offline-first**: No internet required, no backend services
- **OOK Modulation**: On-Off Keying at 10 Hz (100ms per bit)
- **Error Detection**: CRC-16 checksums with parity bit validation
- **Advanced Calibration**: Sophisticated ambient light adaptation
- **Data Persistence**: Enhanced AsyncStorage with type-aware history

## 📡 Advanced VLC Protocol Specification

### Universal Data Packet Format
The system uses a sophisticated packet-based protocol for transmitting arbitrary data types:

```
START | TYPE | LENGTH | PAYLOAD | CHECKSUM | END
  8b     8b     16b    variable    16b       8b
```

**Packet Components:**
- **START Frame**: `11111111` (8 bits) - Transmission begin marker
- **TYPE**: 8-bit data type identifier (see Data Types below)
- **LENGTH**: 16-bit payload length in bytes
- **PAYLOAD**: Variable-length data (auto-chunked for large payloads)
- **CHECKSUM**: 16-bit CRC-16-CCITT validation
- **END Frame**: `00000000` (8 bits) - Transmission end marker

### Supported Data Types
| Type ID | Data Type | Description |
|---------|-----------|-------------|
| 00000001 | TEXT | Plain text messages (backward compatible) |
| 00000010 | JSON | Structured JSON objects |
| 00000011 | FILE | Base64-encoded file data (chunked) |
| 00000100 | SENSOR_DATA | IoT sensor readings |
| 00000101 | IMAGE | Low-resolution images (Base64) |

### Modulation & Transmission
- **Type**: OOK (On-Off Keying) with enhanced error correction
- **Bit Rate**: 10 Hz (100ms per bit)
- **Logic Levels**:
  - 1 → Screen WHITE (#FFFFFF)
  - 0 → Screen BLACK (#000000)
- **Chunking**: Automatic segmentation for payloads > 256 bytes
- **Reassembly**: Intelligent packet reordering and validation

### Error Detection & Correction
- **Legacy**: Even parity bits per byte (backward compatibility)
- **Advanced**: CRC-16-CCITT checksums for complete packet validation
- **Detection**: Ambient light calibration with adaptive thresholding
- **Sampling Rate**: 10 Hz synchronized with transmission

### Detection Algorithm
- **Brightness Calculation**: Y = 0.299R + 0.587G + 0.114B (luma)
- **Thresholding**: Dynamic calibration with 50-unit margin
- **State Machine**: 7-state receiver with packet-aware processing
- **Buffer Management**: Sliding window for packet synchronization

## 🏗️ Architecture

```
/src
 ├── encoder/
 │   └── encoder.js          # Message encoding logic
 ├── decoder/
 │   └── decoder.js          # Message decoding state machine
 ├── screens/
 │   ├── TransmitterScreen.js # Transmission UI
 │   ├── ReceiverScreen.js    # Reception UI with camera
 ├── utils/
 │   ├── parity.js           # Even parity calculation/validation
 │   ├── luma.js             # Brightness calculation
 │   ├── calibration.js      # Ambient light calibration
 └── App.js                  # Main app with tab navigation
```

### State Machine (Receiver)
```
IDLE → CALIBRATING → WAITING_FOR_START → RECEIVING → END_DETECTED → PARITY_CHECK → SUCCESS | ERROR
```

##  Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo CLI: `npm install -g @expo/cli`
- Android device with camera (for testing)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd lightsync
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   # or
   expo start
   ```

4. Scan the QR code with Expo Go app on your phone

### Testing VLC Communication

1. **Setup**:
   - Open the app on two phones (or use one phone for transmit, another for receive)
   - Ensure good lighting conditions
   - Position phones ~30-50cm apart, camera facing transmitter screen

2. **Transmission**:
   - Switch to "Transmit" tab
   - Enter a text message
   - Tap "TRANSMIT"
   - Screen will flash white/black rapidly

3. **Reception**:
   - Switch to "Receive" tab
   - Grant camera permissions
   - Tap "CALIBRATE" to sample ambient light
   - Point camera at transmitting phone's screen
   - Wait for message detection

## 📱 APK Build Instructions

### Using Expo EAS Build (Recommended)

1. **Install EAS CLI**:
   ```bash
   npm install -g @expo/eas-cli
   ```

2. **Login to Expo**:
   ```bash
   eas login
   ```

3. **Configure EAS**:
   ```bash
   eas build:configure
   ```

4. **Build APK**:
   ```bash
   eas build --platform android --profile production
   ```

5. **Download APK**:
   - Check build status: `eas build:list`
   - Download from Expo dashboard or provided link

### Alternative: Expo Build (Legacy)
```bash
expo build:android
```

### App Configuration
- **Permissions**: Camera access for VLC reception
- **Orientation**: Portrait only
- **Target SDK**: Android API 34 (configurable in app.json)

## 🔧 Technical Implementation

### Transmitter Logic
```javascript
// Encode message with parity
const encoded = encodeMessage("Hello");
// Add framing
const framed = addFraming(encoded);
// Transmit at 10Hz intervals
setInterval(() => {
  const bit = getBitToTransmit(framed, currentIndex);
  screenColor = bit === '1' ? WHITE : BLACK;
}, 100);
```

### Receiver Logic
```javascript
// Sample brightness every 100ms
const brightness = calculateLuma(r, g, b);
const bit = brightness > threshold ? 1 : 0;

// Process through state machine
decoder.processBrightness(bit);

// Detect frames and decode
if (decoder.state === END_DETECTED) {
  const message = await decoder.decodeMessage();
}
```

## ⚠️ Limitations & Workarounds

### Expo Camera Limitations
**Issue**: Expo Camera v17 does not provide direct access to raw camera frame buffers or pixel data for real-time brightness analysis.

**Workaround**: For demonstration purposes, brightness sampling is simulated using a sine wave. In production, implement one of:

1. **Frame Processors** (Recommended):
   - Use `@shopify/react-native-skia` with vision-camera
   - Process frames in real-time for accurate brightness calculation

2. **Native Modules**:
   - Create custom native Android/iOS modules for pixel access
   - Use `expo-modules-core` for Expo integration

3. **takePictureAsync Analysis**:
   - Capture images periodically
   - Use image processing libraries to extract center pixel brightness
   - Lower sampling rate (e.g., 5 Hz instead of 10 Hz)

### Current Implementation
- Simulated brightness for receiver demo
- Full transmitter implementation
- Complete protocol logic
- Camera permission handling
- Message persistence with AsyncStorage

## 🧪 Testing

### Unit Tests
Run tests for utility functions:
```bash
npm test
```

### Manual Testing Checklist
- [ ] Transmitter screen flashes correctly for message
- [ ] Receiver calibrates ambient light
- [ ] Message encoding/decoding works
- [ ] Parity validation catches errors
- [ ] Messages persist in AsyncStorage
- [ ] Camera permissions granted
- [ ] APK builds successfully

### Demo Mode
The receiver currently uses simulated brightness data to demonstrate the VLC logic. Replace `getSimulatedBrightness()` with actual camera frame analysis for real VLC communication.

## 📚 API Reference

### Encoder Functions
- `encodeMessage(message)`: Convert string to parity-encoded binary array
- `addFraming(encodedBytes)`: Add start/end frames
- `getBitToTransmit(framedBits, index)`: Get bit for transmission

### Decoder Functions
- `VLCDecoder.processBrightness(brightness)`: Process brightness sample
- `VLCDecoder.decodeMessage()`: Decode and validate received message

### Utility Functions
- `calculateParityBit(binaryString)`: Calculate even parity
- `validateParity(binaryString)`: Validate 9-bit byte with parity
- `calculateLuma(r, g, b)`: Convert RGB to brightness
- `calculateThreshold(samples)`: Compute detection threshold

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement camera frame processing for real VLC
4. Add comprehensive tests
5. Submit pull request

## 📄 License

This project is open source. See LICENSE file for details.

## 🔗 References

- [OOK Modulation](https://en.wikipedia.org/wiki/On%E2%80%93off_keying)
- [VLC Technology](https://en.wikipedia.org/wiki/Visible_light_communication)
- [Expo Camera Documentation](https://docs.expo.dev/versions/latest/sdk/camera/)
- [AsyncStorage Documentation](https://react-native-async-storage.github.io/async-storage/docs/)