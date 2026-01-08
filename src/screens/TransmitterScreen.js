import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { encodeData, getDataTransmissionDuration } from '../encoder/encoder.js';
import { DATA_TYPES } from '../utils/packet.js';
import VLCAlert from '../components/VLCAlert';
import TransmissionProgressBar from '../components/TransmissionProgressBar';

const { width, height } = Dimensions.get('window');

export default function TransmitterScreen() {
  const [data, setData] = useState('');
  const [dataType, setDataType] = useState(DATA_TYPES.TEXT);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [transmissionProgress, setTransmissionProgress] = useState(0);
  const [flashColor, setFlashColor] = useState(0);
  const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
  const framedBitsRef = useRef([]);
  const bitIndexRef = useRef(0);
  const startTimeRef = useRef(0);
  const totalBitsRef = useRef(0);
  const isTransmittingRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const transmit = useCallback(() => {
    if (!isTransmittingRef.current) return;

    const bit = framedBitsRef.current[bitIndexRef.current];
    if (bit === undefined) {
      stopTransmission();
      showAlert('success', 'Transmission Complete', 'Data sent successfully!');
      return;
    }

    setFlashColor(bit === '1' ? 1 : 0);
    setTransmissionProgress((bitIndexRef.current + 1) / totalBitsRef.current);

    bitIndexRef.current++;
  }, []);

  const showAlert = (type, title, message) => {
    setAlert({ visible: true, type, title, message });
  };

  const dismissAlert = () => {
    setAlert({ visible: false, type: 'info', title: '', message: '' });
  };

  const validateData = () => {
    if (!data.trim()) {
      showAlert('error', 'Input Required', 'Please enter data to transmit');
      return false;
    }

    if (dataType === DATA_TYPES.JSON || dataType === DATA_TYPES.SENSOR_DATA) {
      try {
        JSON.parse(data);
      } catch (e) {
        showAlert('error', 'Invalid JSON', 'Please enter valid JSON data');
        return false;
      }
    }

    return true;
  };

  const prepareDataForTransmission = () => {
    let transmissionData;

    switch (dataType) {
      case DATA_TYPES.TEXT:
        transmissionData = data.trim();
        break;
      case DATA_TYPES.JSON:
        transmissionData = JSON.parse(data);
        break;
      case DATA_TYPES.FILE:
      case DATA_TYPES.IMAGE:
        // Assume data is Base64 encoded
        transmissionData = data.trim();
        break;
      case DATA_TYPES.SENSOR_DATA:
        transmissionData = JSON.parse(data);
        break;
      default:
        transmissionData = data.trim();
    }

    return transmissionData;
  };

  const startTransmission = () => {
    if (isTransmittingRef.current) return;
    if (!validateData()) return;

    isTransmittingRef.current = true;
    const transmissionData = prepareDataForTransmission();
    const encoded = encodeData(transmissionData, dataType);
    // Convert array of bit strings to single concatenated bit string
    const bitString = encoded.join('');
    framedBitsRef.current = bitString.split(''); // Convert to array of individual bits
    bitIndexRef.current = 0;
    totalBitsRef.current = framedBitsRef.current.length;
    startTimeRef.current = Date.now();

    setIsTransmitting(true);
    setTransmissionProgress(0);

    showAlert('info', 'Transmission Started', 'Sending data via VLC...');

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

  const getEstimatedDuration = () => {
    if (!data.trim()) return 0;
    try {
      const transmissionData = prepareDataForTransmission();
      return getDataTransmissionDuration(transmissionData, dataType);
    } catch (e) {
      // If parsing fails (e.g., invalid JSON), estimate based on string length
      return getDataTransmissionDuration(data.trim(), DATA_TYPES.TEXT);
    }
  };

  const backgroundColor = flashColor === 1 ? '#FFFFFF' : '#000000';
  const textColor = flashColor === 1 ? '#000000' : '#FFFFFF';

  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={[styles.container, { backgroundColor }]}>
        <View style={styles.overlay}>
          <Text style={[styles.title, { color: textColor }]}>Universal VLC Transmitter</Text>

          {!isTransmitting ? (
            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: textColor }]}>Data Type:</Text>
              <View style={styles.typeSelector}>
                {Object.entries(DATA_TYPES).map(([key, value]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.typeButton,
                      dataType === value && styles.activeTypeButton,
                      { borderColor: textColor }
                    ]}
                    onPress={() => setDataType(value)}
                  >
                    <Text style={[
                      styles.typeButtonText,
                      { color: textColor },
                      dataType === value && styles.activeTypeButtonText
                    ]}>
                      {key.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: textColor }]}>
                Enter {dataType === DATA_TYPES.JSON ? 'JSON' :
                       dataType === DATA_TYPES.FILE ? 'Base64 File Data' :
                       dataType === DATA_TYPES.IMAGE ? 'Base64 Image Data' :
                       dataType === DATA_TYPES.SENSOR_DATA ? 'Sensor JSON' : 'Text'}:
              </Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: textColor }]}
                placeholder={`Enter ${dataType === DATA_TYPES.JSON ? 'JSON' : 'data'} to transmit`}
                placeholderTextColor={textColor}
                value={data}
                onChangeText={setData}
                multiline
                numberOfLines={6}
              />

              <View style={styles.infoContainer}>
                <Text style={[styles.infoText, { color: textColor }]}>
                  Est. Duration: {(getEstimatedDuration() / 1000).toFixed(1)}s
                </Text>
              </View>

              <TouchableOpacity style={[styles.button, { borderColor: textColor }]} onPress={startTransmission}>
                <Text style={[styles.buttonText, { color: textColor }]}>START TRANSMISSION</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.transmittingContainer}>
              <Text style={[styles.statusText, { color: textColor }]}>Transmitting Data...</Text>
              <Text style={[styles.bitText, { color: textColor }]}>
                Bit: {flashColor} ({bitIndexRef.current}/{totalBitsRef.current})
              </Text>

              <TransmissionProgressBar
                progress={transmissionProgress}
                totalBits={totalBitsRef.current}
                transmittedBits={bitIndexRef.current}
                estimatedTimeRemaining={getEstimatedDuration() - (Date.now() - startTimeRef.current)}
              />

              <TouchableOpacity style={[styles.button, { borderColor: textColor }]} onPress={stopTransmission}>
                <Text style={[styles.buttonText, { color: textColor }]}>STOP TRANSMISSION</Text>
              </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    textShadowColor: '#00ff64',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  inputSection: {
    width: '100%',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    alignSelf: 'flex-start',
    width: '80%',
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    width: '80%',
  },
  typeButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    margin: 2,
    minWidth: 60,
    alignItems: 'center',
  },
  activeTypeButton: {
    backgroundColor: 'rgba(0, 255, 100, 0.3)',
    borderColor: '#00ff64',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  activeTypeButtonText: {
    color: '#00ff64',
  },
  input: {
    width: '80%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoContainer: {
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  button: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 255, 100, 0.1)',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  transmittingContainer: {
    alignItems: 'center',
    width: '100%',
  },
  statusText: {
    fontSize: 20,
    marginBottom: 20,
  },
  bitText: {
    fontSize: 16,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
});
