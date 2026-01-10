# VLC Data Dashboard Documentation

This document explains every visible element, text, and component on each screen of the VLC Data Broadcast application.

## Dashboard Screen

### Title
- **VLC Data Dashboard**: Main title of the dashboard screen, indicating this is the central monitoring interface for VLC (Visible Light Communication) data transmission.

### Transmission Overview Card
- **Transmission Overview**: Section header showing summary statistics of data transmissions.
- **Total**: Number of total transmission attempts (both successful and failed).
- **Success**: Number of successfully received transmissions (displayed in green).
- **Failed**: Number of failed transmissions (displayed in red).
- **Avg BPS**: Average bitrate in bits per second, calculated from successful transmissions.

### Live Signal Monitor Card
- **Live Signal Monitor**: Section header for real-time signal monitoring.
- **Signal Indicator**: Visual component showing current signal status with:
  - Active/inactive state (green when receiving data)
  - Current bit value (0 or 1)
  - Sync status (waiting, syncing, synced, error)
- **Transmission Progress Bar**: Shows progress of any ongoing transmission, bitrate, and remaining time.

### AI Adaptive Transmission Component
- **AI Adaptive Transmission**: Intelligent system that optimizes transmission parameters.
- Analyzes current bitrate, error rates, and success rates to suggest optimal transmission settings.

### Behavioral Pattern Driven Transmission Scheduling Component
- **Behavioral Pattern Driven Transmission Scheduling**: AI system that analyzes usage patterns to recommend optimal transmission times and schedules.

### Received Data History Card
- **Received Data History**: Section showing list of previously received data.
- **Filter Buttons**: Buttons to filter data by type:
  - **ALL**: Show all data types
  - **TEXT**: Text messages
  - **JSON**: JSON data objects
  - **FILE**: Binary files
  - **IMAGE**: Image files
  - **SENSOR_DATA**: Sensor readings/data
- **Data List**: Scrollable list of received data items, each showing type, content preview, and timestamp.
- **No data received yet**: Message shown when no data has been received.

### Integrity Status Card
- **Integrity Status**: Section showing data integrity metrics.
- **Success Rate**: Percentage of successful transmissions (successful/total * 100).
- **Total Data**: Total amount of data received in kilobytes.
- **Error Count**: Number of transmission errors/failures (displayed in red).
- **Avg Bitrate**: Average transmission speed in bits per second.

## Receiver Screen

### Title
- **Universal VLC Receiver**: Main title indicating this screen receives VLC transmissions using the device camera.

### State Text (Dynamic)
- **Ready to calibrate**: Initial state, waiting for user to start calibration.
- **Calibrating... X%**: Shows calibration progress percentage.
- **Waiting for transmission...**: Calibrated and waiting for incoming data.
- **Receiving data...**: Actively receiving transmission data.
- **Processing message...**: Processing completed transmission.
- **Validating data...**: Checking data integrity with parity bits.
- **Message received successfully!**: Transmission completed successfully.
- **Transmission error - parity failed**: Data validation failed.

### Signal Indicator
- Visual component showing current signal status:
  - Active/inactive state
  - Current bit value (0 or 1)
  - Sync status (waiting, syncing, synced, error)

### Control Buttons (Context-dependent)
- **START CALIBRATION**: Begins camera calibration process (shown when idle).
- **STOP CALIBRATION**: Cancels ongoing calibration (shown during calibration).
- **STOP RECEIVING**: Stops listening for transmissions (shown when waiting/receiving).

### Last Received Data Card
- **Last Received Data**: Shows the most recently received data.
- Displays the actual received content or data preview.

### Data History Card
- **Data History**: Shows recent received data entries.
- Each entry shows:
  - **Data Type**: TEXT, JSON, FILE, IMAGE, or SENSOR_DATA
  - **Data Preview**: Content snippet or size information
  - **Timestamp**: When the data was received
- **No data received yet**: Shown when no data history exists.

### Predictive Signal Interference Compensation Component
- **Predictive Signal Interference Compensation**: AI system that compensates for environmental interference affecting signal quality.

### Multi-Scale Temporal Error Correction Component
- **Multi-Scale Temporal Error Correction**: Advanced error correction system using multiple time scales to fix transmission errors.

### Error Messages
- **Calibration error: [details]**: Errors during calibration process.
- **Sampling error: [details]**: Errors during signal sampling.

## Transmitter Screen

### Title
- **Universal VLC Transmitter**: Main title indicating this screen transmits data using device screen flashing.

### Data Type Selector
- **Data Type:**: Label for data type selection.
- **Type Buttons**:
  - **TEXT**: Plain text data
  - **JSON**: JSON formatted data
  - **FILE**: Binary file data
  - **IMAGE**: Image file data
  - **SENSOR DATA**: Sensor readings in JSON format

### File Picker Buttons
- **Pick Image**: Opens image picker to select and encode image files.
- **Pick File**: Opens document picker to select and encode any file type.

### Input Section
- **Enter [Type]:**: Label indicating what type of data to input.
- **Text Input Field**: Multi-line input for text/JSON data, or display area for selected files.
- **Selected Image (Base64):**: Label when image is selected.
- **Selected File (Base64):**: Label when file is selected.

### Information Display
- **Est. Duration: X.Xs**: Estimated transmission time in seconds based on data size and type.

### Control Buttons
- **START TRANSMISSION**: Begins transmitting the entered data.
- **STOP TRANSMISSION**: Cancels ongoing transmission.

### Transmission Status (When Transmitting)
- **Transmitting Data...**: Status message during transmission.
- **Bit: X (current/total)**: Shows current bit being transmitted and progress (e.g., "Bit: 1 (45/1024)").
- **Transmission Progress Bar**: Visual progress indicator showing:
  - Transmission progress percentage
  - Total bits and transmitted bits
  - Estimated time remaining

## Alert System
- **VLC Alert**: Modal popup system for notifications with types:
  - **Success**: Green alerts for successful operations
  - **Error**: Red alerts for errors
  - **Info**: Blue alerts for information
  - **Warning**: Yellow alerts for warnings

## Common Components

### Signal Indicator
- Visual representation of VLC signal status:
  - **Active State**: Green glow when signal is being received/transmitted
  - **Bit Value**: Shows current binary value (0=dark, 1=light)
  - **Sync Status**: Connection state (waiting/syncing/synced/error)

### Transmission Progress Bar
- Progress indicator for data transmission:
  - **Progress Bar**: Visual fill showing completion percentage
  - **Bitrate**: Current transmission speed in bps
  - **Time Remaining**: Estimated completion time

### Data Card
- Individual data entry display:
  - **Type Badge**: Shows data type (TEXT, JSON, etc.)
  - **Content Preview**: First 50 characters or size info
  - **Timestamp**: Reception/transmission time
  - **Expandable**: Tap to show full details

## Technical Terms Glossary

- **VLC**: Visible Light Communication - data transmission using light
- **OOK**: On-Off Keying - modulation method using light on/off for binary data
- **Bitrate (BPS)**: Bits Per Second - data transmission speed
- **Parity Check**: Error detection method using checksum bits
- **Calibration**: Process to determine light/dark thresholds for accurate reception
- **Packet**: Structured data unit containing type, payload, and error checking
- **Base64**: Text encoding format for binary data
- **JSON**: JavaScript Object Notation - structured data format
- **Sync Status**: Synchronization state between transmitter and receiver
- **Signal Strength**: Quality metric based on brightness variation consistency

## Screen Navigation
- **Dashboard Tab**: Main monitoring and statistics screen
- **Receiver Tab**: Camera-based data reception screen
- **Transmitter Tab**: Screen-based data transmission screen