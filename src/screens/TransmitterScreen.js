import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Alert, Platform } from 'react-native';
import { encodeData, getDataTransmissionDuration } from '../encoder/encoder.js';
import { DATA_TYPES } from '../utils/packet.js';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
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

  const pickImage = async () => {
    try {
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Camera roll permissions are required to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7, // Compress for reasonable transmission time
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setData(asset.base64);
          setDataType(DATA_TYPES.IMAGE);
          showAlert('success', 'Image Selected', `Selected: ${asset.fileName || 'Image'}`);
        } else {
          showAlert('error', 'Base64 Error', 'Could not encode image to Base64');
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      showAlert('error', 'Image Picker Error', 'Failed to select image');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
        base64: true,
      });

      if (result.type === 'success') {
        // Check file size (limit to 1MB for reasonable transmission)
        const fileSizeMB = result.size / (1024 * 1024);
        if (fileSizeMB > 1) {
          showAlert('error', 'File Too Large', 'Please select a file smaller than 1MB');
          return;
        }

        if (result.base64) {
          setData(result.base64);
          setDataType(DATA_TYPES.FILE);
          showAlert('success', 'File Selected', `Selected: ${result.name}`);
        } else {
          showAlert('error', 'Base64 Error', 'Could not encode file to Base64');
        }
      }
    } catch (error) {
      console.error('Document picker error:', error);
      showAlert('error', 'File Picker Error', 'Failed to select file');
    }
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

              {/* File/Image Picker Buttons */}
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[styles.pickerButton, { borderColor: textColor }]}
                  onPress={pickImage}
                >
                  <Text style={[styles.pickerButtonText, { color: textColor }]}>
                    =ø Pick Image
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pickerButton, { borderColor: textColor }]}
                  onPress={pickDocument}
                >
                  <Text style={[styles.pickerButtonText, { color: textColor }]}>
                    =Ä Pick File
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: textColor }]}>
                {dataType === DATA_TYPES.IMAGE ? 'Selected Image (Base64):' :
                 dataType === DATA_TYPES.FILE ? 'Selected File (Base64):' :
                 `Enter ${dataType === DATA_TYPES.JSON ? 'JSON' :
                        dataType === DATA_TYPES.SENSOR_DATA ? 'Sensor JSON' : 'Text'}:`}
              </Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor: textColor }]}
                placeholder={dataType === DATA_TYPES.IMAGE ? 'Image will be loaded here...' :
                           dataType === DATA_TYPES.FILE ? 'File will be loaded here...' :
                           `Enter ${dataType === DATA_TYPES.JSON ? 'JSON' :
                                 dataType === DATA_TYPES.SENSOR_DATA ? 'sensor JSON' : 'text'} to transmit`}
                placeholderTextColor={textColor}
                value={data}
                onChangeText={setData}
                multiline
                numberOfLines={dataType === DATA_TYPES.IMAGE || dataType === DATA_TYPES.FILE ? 3 : 6}
                editable={dataType !== DATA_TYPES.IMAGE && dataType !== DATA_TYPES.FILE}
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
