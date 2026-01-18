import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Dimensions } from 'react-native';
import { payloadBuilder } from '../utils/payloadBuilder.js';
import { encodeData } from '../encoder/encoder.js';
import { DATA_TYPES } from '../utils/packet.js';
import DeviceManager from '../utils/device.js';
import PairingManager from '../utils/pairing.js';
import VLCAlert from '../components/VLCAlert';
import TransmissionProgressBar from '../components/TransmissionProgressBar';

const { width, height } = Dimensions.get('window');

export default function BackendManagerScreen() {
  // Generate immediate fallback device ID for instant display
  const generateImmediateDeviceId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `device-${timestamp}-${random}`;
  };

  const [deviceId, setDeviceId] = useState(generateImmediateDeviceId()); // Show immediately
  const [backendUrl, setBackendUrl] = useState('http://localhost:3000');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [transmissionProgress, setTransmissionProgress] = useState(0);
  const [flashColor, setFlashColor] = useState(0);
  const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
  const [pairedDevices, setPairedDevices] = useState([]);
  const [pairingStatus, setPairingStatus] = useState('idle'); // 'idle', 'requesting', 'transmitting', 'waiting'
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const [command, setCommand] = useState('ping');
  const [selectedReceiver, setSelectedReceiver] = useState('');
  const [commandResult, setCommandResult] = useState(null);

  const framedBitsRef = useRef([]);
  const bitIndexRef = useRef(0);
  const startTimeRef = useRef(0);
  const totalBitsRef = useRef(0);
  const isTransmittingRef = useRef(false);
  const intervalRef = useRef(null);
  const expiryIntervalRef = useRef(null);

  // Initialize device and load paired devices
  useEffect(() => {
    const initialize = async () => {
      try {
        // Get device ID (should be cached and fast)
        const id = await DeviceManager.getDeviceId();
        setDeviceId(id);

        await loadPairedDevices();
      } catch (error) {
        console.error('Failed to initialize:', error);
        showAlert('error', 'Initialization Error', error.message);
      }
    };

    initialize();

    // Set backend URL
    payloadBuilder.setBackendUrl(backendUrl);

    return () => {
      if (expiryIntervalRef.current) {
        clearInterval(expiryIntervalRef.current);
      }
    };
  }, [backendUrl]);

  const loadPairedDevices = async () => {
    try {
      const devices = await PairingManager.getPairedDevices();
      setPairedDevices(devices);
    } catch (error) {
      console.error('Failed to load paired devices:', error);
    }
  };

  const transmit = React.useCallback(() => {
    if (!isTransmittingRef.current) return;

    const bit = framedBitsRef.current[bitIndexRef.current];
    if (bit === undefined) {
      stopTransmission();
      if (pairingStatus === 'transmitting') {
        setPairingStatus('waiting');
        showAlert('success', 'Pairing Token Sent', 'Waiting for receiver to complete pairing...');
      } else {
        showAlert('success', 'Transmission Complete', 'Data sent successfully!');
      }
      return;
    }

    setFlashColor(bit === '1' ? 1 : 0);
    setTransmissionProgress((bitIndexRef.current + 1) / totalBitsRef.current);
    bitIndexRef.current++;
  }, [pairingStatus]);

  const showAlert = (type, title, message) => {
    setAlert({ visible: true, type, title, message });
  };

  const dismissAlert = () => {
    setAlert({ visible: false, type: 'info', title: '', message: '' });
  };

  const startTransmission = (encodedData) => {
    if (isTransmittingRef.current) return;

    isTransmittingRef.current = true;
    const bitString = encodedData.join(''); // Convert array of bit strings to single string
    framedBitsRef.current = bitString.split(''); // Convert to array of individual bits
    bitIndexRef.current = 0;
    totalBitsRef.current = framedBitsRef.current.length;
    startTimeRef.current = Date.now();

    setIsTransmitting(true);
    setTransmissionProgress(0);

    // Transmit at 10 Hz (100ms intervals)
    intervalRef.current = setInterval(transmit, 100);
  };

  const stopTransmission = () => {
    isTransmittingRef.current = false;
    setIsTransmitting(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setFlashColor(0);
    setTransmissionProgress(0);
  };

  const handlePairViaLight = async () => {
    if (!selectedReceiver.trim()) {
      showAlert('error', 'Receiver Required', 'Please enter the receiver device ID');
      return;
    }

    // Prevent pairing with yourself
    if (selectedReceiver.trim() === deviceId) {
      showAlert('error', 'Invalid Pairing', 'You cannot pair a device with itself. Please enter a different device ID.');
      return;
    }

    try {
      setPairingStatus('requesting');
      showAlert('info', 'Requesting Pairing Token', 'Contacting backend...');

      const result = await PairingManager.requestPairingToken(selectedReceiver, backendUrl);

      if (result.success) {
        setTokenExpiry(result.expiresAt);
        setPairingStatus('transmitting');
        showAlert('success', 'Token Received', 'Starting VLC transmission...');

        // Start expiry countdown
        startExpiryCountdown(result.expiresAt);

        // Build and transmit pairing payload
        const payload = await payloadBuilder.buildAuthPayload(deviceId, selectedReceiver);
        startTransmission(payload.encoded);
      } else {
        setPairingStatus('idle');
        showAlert('error', 'Pairing Failed', result.message);
      }
    } catch (error) {
      setPairingStatus('idle');
      showAlert('error', 'Pairing Error', error.message);
      console.error('Pairing error:', error);
    }
  };

  const startExpiryCountdown = (expiresAt) => {
    if (expiryIntervalRef.current) {
      clearInterval(expiryIntervalRef.current);
    }

    expiryIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      if (remaining <= 0) {
        setTokenExpiry(null);
        setPairingStatus('idle');
        showAlert('error', 'Token Expired', 'Pairing token has expired. Please try again.');
        clearInterval(expiryIntervalRef.current);
      }
    }, 1000);
  };

  const handleSendSecureCommand = async () => {
    if (!selectedReceiver || !pairedDevices.includes(selectedReceiver)) {
      showAlert('error', 'Invalid Receiver', 'Please select a paired device');
      return;
    }

    try {
      showAlert('info', 'Creating Signed Command', 'Preparing secure command...');

      const signedCommand = await PairingManager.createSignedCommand(selectedReceiver, command);

      showAlert('success', 'Command Created', 'Starting VLC transmission...');

      // Build and transmit command payload
      const payload = await payloadBuilder.buildCommandPayload(signedCommand);
      startTransmission(payload.encoded);

      setCommandResult({ status: 'sent', command, receiver: selectedReceiver });
    } catch (error) {
      showAlert('error', 'Command Error', error.message);
      console.error('Send command error:', error);
    }
  };

  const handleRevokePairing = async (pairedDeviceId) => {
    Alert.alert(
      'Revoke Pairing',
      `Are you sure you want to revoke pairing with ${pairedDeviceId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await PairingManager.revokePairing(pairedDeviceId);
              if (success) {
                await loadPairedDevices();
                showAlert('success', 'Pairing Revoked', `Pairing with ${pairedDeviceId} has been revoked`);
              } else {
                showAlert('error', 'Revoke Failed', 'Failed to revoke pairing');
              }
            } catch (error) {
              showAlert('error', 'Revoke Error', error.message);
            }
          }
        }
      ]
    );
  };

  const backgroundColor = flashColor === 1 ? '#FFFFFF' : '#000000';
  const textColor = flashColor === 1 ? '#000000' : '#FFFFFF';

  const getPairingStatusText = () => {
    switch (pairingStatus) {
      case 'requesting': return 'Requesting token...';
      case 'transmitting': return 'Transmitting pairing token...';
      case 'waiting': return 'Waiting for pairing completion...';
      default: return 'Ready to pair';
    }
  };

  const getTokenExpiryText = () => {
    if (!tokenExpiry) return '';
    const remaining = Math.max(0, Math.floor((tokenExpiry - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `Token expires in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.overlay}>
          <Text style={[styles.title, { color: textColor }]}>Secure Pairing & Control</Text>

          {/* Device Identity */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Device Identity</Text>
            <View style={[styles.deviceIdContainer, { borderColor: textColor }]}>
              <Text style={[styles.deviceIdLabel, { color: textColor }]}>Device ID:</Text>
              <Text style={[styles.deviceId, { color: textColor }]} selectable={true}>
                {deviceId || 'Loading...'}
              </Text>
            </View>
          </View>

          {/* Backend Configuration */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Backend Configuration</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor: textColor }]}
              placeholder="Backend URL"
              placeholderTextColor={textColor}
              value={backendUrl}
              onChangeText={setBackendUrl}
            />
          </View>

          {/* Pairing Status */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Pairing Status</Text>
            <Text style={[styles.statusText, { color: textColor }]}>
              {getPairingStatusText()}
            </Text>
            {tokenExpiry && (
              <Text style={[styles.expiryText, { color: textColor }]}>
                {getTokenExpiryText()}
              </Text>
            )}
          </View>

          {/* Paired Devices List */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Paired Devices ({pairedDevices.length})</Text>
            {pairedDevices.length > 0 ? (
              pairedDevices.map((device, index) => (
                <View key={index} style={[styles.pairedDevice, { borderColor: textColor }]}>
                  <Text style={[styles.pairedDeviceId, { color: textColor }]}>{device}</Text>
                  <TouchableOpacity
                    style={[styles.revokeButton, { borderColor: '#ff4444' }]}
                    onPress={() => handleRevokePairing(device)}
                  >
                    <Text style={[styles.revokeButtonText, { color: '#ff4444' }]}>Revoke</Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: textColor }]}>No paired devices yet</Text>
            )}
          </View>

          {/* Pair via Light */}
          {!isTransmitting ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Pair via Light</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: textColor }]}
                placeholder="Enter receiver device ID"
                placeholderTextColor={textColor}
                value={selectedReceiver}
                onChangeText={setSelectedReceiver}
              />
              <TouchableOpacity
                style={[styles.primaryButton, { borderColor: textColor }]}
                onPress={handlePairViaLight}
                disabled={pairingStatus !== 'idle'}
              >
                <Text style={[styles.primaryButtonText, { color: textColor }]}>
                  {pairingStatus === 'idle' ? 'Pair via Light' : getPairingStatusText()}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Send Secure Command */}
          {pairedDevices.length > 0 && !isTransmitting && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Send Secure Command</Text>

              <Text style={[styles.label, { color: textColor }]}>Select Receiver:</Text>
              <ScrollView horizontal style={styles.receiverSelector}>
                {pairedDevices.map((device, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.receiverButton,
                      { borderColor: textColor },
                      selectedReceiver === device && styles.selectedReceiver
                    ]}
                    onPress={() => setSelectedReceiver(device)}
                  >
                    <Text style={[
                      styles.receiverButtonText,
                      { color: textColor },
                      selectedReceiver === device && styles.selectedReceiverText
                    ]}>
                      {device}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={[styles.input, { color: textColor, borderColor: textColor }]}
                placeholder="Command (ping, status, etc.)"
                placeholderTextColor={textColor}
                value={command}
                onChangeText={setCommand}
              />

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: textColor }]}
                onPress={handleSendSecureCommand}
                disabled={!selectedReceiver}
              >
                <Text style={[styles.secondaryButtonText, { color: textColor }]}>
                  Send Secure Command
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Transmission Progress */}
          {isTransmitting && (
            <View style={styles.transmittingContainer}>
              <Text style={[styles.statusText, { color: textColor }]}>Transmitting Data...</Text>
              <Text style={[styles.bitText, { color: textColor }]}>
                Bit: {flashColor} ({bitIndexRef.current}/{totalBitsRef.current})
              </Text>

              <TransmissionProgressBar
                progress={transmissionProgress}
                totalBits={totalBitsRef.current}
                transmittedBits={bitIndexRef.current}
                estimatedTimeRemaining={totalBitsRef.current * 100 - (Date.now() - startTimeRef.current)}
              />

              <TouchableOpacity
                style={[styles.stopButton, { borderColor: '#ff4444' }]}
                onPress={stopTransmission}
              >
                <Text style={[styles.stopButtonText, { color: '#ff4444' }]}>STOP TRANSMISSION</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Command Result */}
          {commandResult && (
            <View style={styles.resultSection}>
              <Text style={[styles.resultTitle, { color: textColor }]}>Last Command:</Text>
              <Text style={[styles.resultText, { color: textColor }]}>
                Command: {commandResult.command}
              </Text>
              <Text style={[styles.resultText, { color: textColor }]}>
                To: {commandResult.receiver}
              </Text>
              <Text style={[styles.resultText, { color: textColor }]}>
                Status: {commandResult.status}
              </Text>
            </View>
          )}
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
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    textShadowColor: '#00ff64',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  section: {
    marginBottom: 20,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  deviceIdContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  deviceIdLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  deviceId: {
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
  },
  expiryText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#ffaa00',
    fontWeight: 'bold',
  },
  pairedDevice: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(0, 255, 100, 0.1)',
  },
  pairedDeviceId: {
    fontSize: 16,
    fontFamily: 'monospace',
    flex: 1,
  },
  revokeButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  revokeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  primaryButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 255, 100, 0.1)',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 100, 255, 0.1)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  stopButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    marginTop: 20,
    alignItems: 'center',
  },
  stopButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  receiverSelector: {
    marginBottom: 10,
  },
  receiverButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedReceiver: {
    backgroundColor: 'rgba(0, 100, 255, 0.3)',
    borderColor: '#0064ff',
  },
  receiverButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  selectedReceiverText: {
    color: '#0064ff',
  },
  transmittingContainer: {
    alignItems: 'center',
    width: '100%',
  },
  bitText: {
    fontSize: 16,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  resultSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  resultText: {
    fontSize: 14,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
});