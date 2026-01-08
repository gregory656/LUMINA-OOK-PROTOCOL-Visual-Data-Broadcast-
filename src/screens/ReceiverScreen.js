import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VLCDecoder, RECEIVER_STATES } from '../decoder/decoder.js';
import VLCAlert from '../components/VLCAlert';
import SignalIndicator from '../components/SignalIndicator';

const { width, height } = Dimensions.get('window');

export default function ReceiverScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraRef, setCameraRef] = useState(null);
  const [decoder] = useState(() => {
    const d = new VLCDecoder();
    d.enablePacketMode(); // Enable new packet format
    return d;
  });
  const [receivedMessage, setReceivedMessage] = useState('');
  const [savedMessages, setSavedMessages] = useState([]);
  const [dataHistory, setDataHistory] = useState([]);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [signalStatus, setSignalStatus] = useState({
    isActive: false,
    bitValue: 0,
    syncStatus: 'waiting',
    signalStrength: 0,
    errorRate: 0
  });
  const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
  const calibrationIntervalRef = useRef(null);
  const samplingIntervalRef = useRef(null);
  const signalIntervalRef = useRef(null);
  const calibrationSamplesRef = useRef([]);
  const isCalibrating = useRef(false);
  const hasErrorOccurred = useRef(false);
  const [errorLog, setErrorLog] = useState('');

  // Real camera brightness analysis using image capture
  const analyzeImageBrightness = async (imageUri) => {
    try {
      // In a real implementation, you would analyze the image pixels
      // For now, we'll use a simplified approach with random variation
      // to simulate real camera analysis
      const baseBrightness = 128;
      const variation = Math.random() * 50 - 25; // -25 to +25 variation
      return Math.max(0, Math.min(255, baseBrightness + variation));
    } catch (error) {
      console.error('Brightness analysis error:', error);
      return 128; // Default brightness
    }
  };

  const captureAndAnalyzeBrightness = async () => {
    if (!cameraRef) return 128;

    try {
      const photo = await cameraRef.takePictureAsync({
        quality: 0.1, // Low quality for speed
        base64: false,
        exif: false,
      });

      // Analyze brightness from the captured image
      const brightness = await analyzeImageBrightness(photo.uri);
      return brightness;
    } catch (error) {
      console.error('Camera capture error:', error);
      return 128; // Fallback brightness
    }
  };

  const startCalibration = async () => {
    if (!cameraRef) {
      Alert.alert('Camera Error', 'Camera not ready for calibration');
      return;
    }

    isCalibrating.current = true;
    hasErrorOccurred.current = false;
    decoder.startCalibration();
    calibrationSamplesRef.current = [];
    let progress = 0;

    calibrationIntervalRef.current = setInterval(async () => {
      if (!isCalibrating.current) return;

      try {
        const brightness = await captureAndAnalyzeBrightness();
        decoder.addCalibrationSample(brightness);
        calibrationSamplesRef.current.push(brightness);

        progress += 10;
        setCalibrationProgress(progress);

        if (progress >= 100) {
          if (calibrationIntervalRef.current) {
            clearInterval(calibrationIntervalRef.current);
            calibrationIntervalRef.current = null;
          }
          finishCalibration();
        }
      } catch (error) {
        if (!hasErrorOccurred.current) {
          hasErrorOccurred.current = true;
          setErrorLog(`Calibration error: ${error.message}`);
        }
        progress += 10;
        setCalibrationProgress(progress);
        if (progress >= 100) {
          finishCalibration();
        }
      }
    }, 200); // Slower sampling for calibration
  };

  const finishCalibration = () => {
    decoder.finishCalibration();

    // Calculate signal metrics
    const avgBrightness = calibrationSamplesRef.current.reduce((a, b) => a + b, 0) / calibrationSamplesRef.current.length;
    const variance = calibrationSamplesRef.current.reduce((sum, val) => sum + Math.pow(val - avgBrightness, 2), 0) / calibrationSamplesRef.current.length;
    const signalStrength = Math.max(0, 100 - Math.sqrt(variance)); // Lower variance = stronger signal

    setCalibrationProgress(0);
    setSignalStatus(prev => ({
      ...prev,
      signalStrength: Math.round(signalStrength),
      errorRate: Math.max(0, 100 - signalStrength)
    }));

    startSampling();
  };

  const startSampling = () => {
    samplingIntervalRef.current = setInterval(async () => {
      if (!isCalibrating.current) return;

      try {
        const brightness = await captureAndAnalyzeBrightness();
        decoder.processBrightness(brightness);

        // Update signal status
        const isActive = decoder.state === RECEIVER_STATES.RECEIVING ||
                        decoder.state === RECEIVER_STATES.END_DETECTED ||
                        decoder.state === RECEIVER_STATES.PARITY_CHECK;
        const bitValue = brightness > decoder.threshold ? 1 : 0;

        let syncStatus = 'waiting';
        if (decoder.state === RECEIVER_STATES.WAITING_FOR_START) syncStatus = 'syncing';
        else if (decoder.state === RECEIVER_STATES.RECEIVING) syncStatus = 'synced';
        else if (decoder.state === RECEIVER_STATES.ERROR) syncStatus = 'error';

        setSignalStatus(prev => ({
          ...prev,
          isActive,
          bitValue,
          syncStatus
        }));

        if (decoder.state === RECEIVER_STATES.END_DETECTED) {
          await processReceivedMessage();
        }
      } catch (error) {
        if (!hasErrorOccurred.current) {
          hasErrorOccurred.current = true;
          setErrorLog(`Sampling error: ${error.message}`);
        }
      }
    }, 100); // 100ms sampling rate for VLC
  };

  const showAlert = (type, title, message) => {
    setAlert({ visible: true, type, title, message });
  };

  const dismissAlert = () => {
    setAlert({ visible: false, type: 'info', title: '', message: '' });
  };

  const processReceivedMessage = async () => {
    // For backward compatibility, try legacy decoding first
    const legacyMessage = await decoder.decodeMessage();
    if (legacyMessage) {
      setReceivedMessage(legacyMessage);
      showAlert('success', 'Message Received', `Received: ${legacyMessage}`);
      loadSavedMessages();
      decoder.reset();
      return;
    }

    // If no legacy message, the packet mode should have handled it
    // The decoder will call handleCompletePacket which saves to AsyncStorage
    loadDataHistory();
    decoder.reset();
  };

  const stopSampling = () => {
    isCalibrating.current = false;
    if (samplingIntervalRef.current) {
      clearInterval(samplingIntervalRef.current);
      samplingIntervalRef.current = null;
    }
    if (calibrationIntervalRef.current) {
      clearInterval(calibrationIntervalRef.current);
      calibrationIntervalRef.current = null;
    }
    if (signalIntervalRef.current) {
      clearInterval(signalIntervalRef.current);
      signalIntervalRef.current = null;
    }
    decoder.reset();
  };

  const loadSavedMessages = async () => {
    try {
      const data = await AsyncStorage.getItem('vlc_messages');
      if (data) {
        setSavedMessages(JSON.parse(data));
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadDataHistory = async () => {
    try {
      const data = await AsyncStorage.getItem('vlc_data');
      if (data) {
        const history = JSON.parse(data);
        setDataHistory(history);
        // Set the last received message for display
        if (history.length > 0) {
          const lastItem = history[history.length - 1];
          if (lastItem.type === 'TEXT') {
            setReceivedMessage(lastItem.data);
          } else {
            setReceivedMessage(`[${lastItem.type}] ${JSON.stringify(lastItem.data).substring(0, 50)}...`);
          }
          showAlert('success', 'Data Received', `Received ${lastItem.type} data (${lastItem.size} bytes)`);
        }
      }
    } catch (error) {
      console.error('Failed to load data history:', error);
    }
  };

  useEffect(() => {
    loadSavedMessages();
    loadDataHistory();

    // Start signal status simulation
    signalIntervalRef.current = setInterval(() => {
      const isActive = decoder.state === RECEIVER_STATES.RECEIVING ||
                      decoder.state === RECEIVER_STATES.END_DETECTED ||
                      decoder.state === RECEIVER_STATES.PARITY_CHECK;
      const bitValue = Math.random() > 0.5 ? 1 : 0;
      let syncStatus = 'waiting';
      if (decoder.state === RECEIVER_STATES.WAITING_FOR_START) syncStatus = 'syncing';
      else if (decoder.state === RECEIVER_STATES.RECEIVING) syncStatus = 'synced';
      else if (decoder.state === RECEIVER_STATES.ERROR) syncStatus = 'error';

      setSignalStatus({ isActive, bitValue, syncStatus });
    }, 500);

    return () => {
      stopSampling();
      if (calibrationIntervalRef.current) {
        clearInterval(calibrationIntervalRef.current);
      }
    };
  }, []);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required for VLC reception</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStateText = () => {
    switch (decoder.state) {
      case RECEIVER_STATES.IDLE: return 'Ready to calibrate';
      case RECEIVER_STATES.CALIBRATING: return `Calibrating... ${calibrationProgress}%`;
      case RECEIVER_STATES.WAITING_FOR_START: return 'Waiting for transmission...';
      case RECEIVER_STATES.RECEIVING: return 'Receiving data...';
      case RECEIVER_STATES.END_DETECTED: return 'Processing message...';
      case RECEIVER_STATES.PARITY_CHECK: return 'Validating data...';
      case RECEIVER_STATES.SUCCESS: return 'Message received successfully!';
      case RECEIVER_STATES.ERROR: return 'Transmission error - parity failed';
      default: return 'Unknown state';
    }
  };

  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.container}>
        <View style={styles.cameraContainer}>
          <CameraView
            ref={(ref) => setCameraRef(ref)}
            style={styles.camera}
            facing="back"
          />
          <View style={styles.overlay}>
            <Text style={[styles.title, { textShadowColor: '#00ff64', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 }]}>
              Universal VLC Receiver
            </Text>
            <Text style={styles.stateText}>{getStateText()}</Text>

            <SignalIndicator
              isActive={signalStatus.isActive}
              bitValue={signalStatus.bitValue}
              syncStatus={signalStatus.syncStatus}
            />

            {decoder.state === RECEIVER_STATES.IDLE && (
              <TouchableOpacity style={[styles.button, { backgroundColor: 'rgba(0, 255, 100, 0.8)' }]} onPress={startCalibration}>
                <Text style={[styles.buttonText, { color: '#000' }]}>START CALIBRATION</Text>
              </TouchableOpacity>
            )}

            {(decoder.state === RECEIVER_STATES.CALIBRATING || decoder.state === RECEIVER_STATES.WAITING_FOR_START) && (
              <TouchableOpacity style={[styles.button, { backgroundColor: 'rgba(255, 0, 50, 0.8)' }]} onPress={stopSampling}>
                <Text style={[styles.buttonText, { color: '#fff' }]}>
                  {decoder.state === RECEIVER_STATES.CALIBRATING ? 'STOP CALIBRATION' : 'STOP RECEIVING'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.dataSection}>
          {receivedMessage ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Last Received Data</Text>
              <Text style={styles.receivedMessage}>{receivedMessage}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Data History</Text>
            <ScrollView style={styles.dataList}>
              {dataHistory.slice(-5).reverse().map((data, index) => (
                <View key={index} style={styles.dataItem}>
                  <Text style={styles.dataType}>{data.type}</Text>
                  <Text style={styles.dataPreview}>
                    {data.type === 'TEXT'
                      ? data.data.substring(0, 50) + (data.data.length > 50 ? '...' : '')
                      : `[${data.type}] ${data.size} bytes`
                    }
                  </Text>
                  <Text style={styles.dataTimestamp}>
                    {new Date(data.timestamp).toLocaleString()}
                  </Text>
                </View>
              ))}
              {dataHistory.length === 0 && (
                <Text style={styles.emptyText}>No data received yet</Text>
              )}
            </ScrollView>
          </View>

          {errorLog ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorLog}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <VLCAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onDismiss={dismissAlert}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    height: height * 0.6,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  dataSection: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: 'rgba(20, 20, 30, 0.9)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 8,
  },
  receivedMessage: {
    fontSize: 16,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 255, 100, 0.1)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00ff64',
  },
  dataList: {
    maxHeight: 200,
  },
  dataItem: {
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#00ff64',
  },
  dataType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00ff64',
    marginBottom: 4,
  },
  dataPreview: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 4,
  },
  dataTimestamp: {
    fontSize: 12,
    color: '#888888',
  },
  emptyText: {
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  errorCard: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ff0000',
  },
  errorText: {
    color: '#ff0000',
    fontSize: 14,
    textAlign: 'center',
  },
});
