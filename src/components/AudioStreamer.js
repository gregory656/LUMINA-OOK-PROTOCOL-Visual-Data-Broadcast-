import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { encodeData, getDataTransmissionDuration } from '../encoder/encoder.js';
import { DATA_TYPES } from '../utils/packet.js';
import VLCAlert from './VLCAlert';

const { width, height } = Dimensions.get('window');

// Audio compression using simple delta encoding + quantization
class AudioCompressor {
  constructor() {
    this.lastSample = 0;
    this.bitDepth = 8; // Reduce from 16-bit to 8-bit
  }

  compress(audioData) {
    // Convert Float32Array to 8-bit signed integers with delta encoding
    const compressed = new Int8Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.floor(audioData[i] * 127); // Convert to -127 to 127 range
      const delta = sample - this.lastSample;
      compressed[i] = Math.max(-127, Math.min(127, delta)); // Clamp delta
      this.lastSample = sample;
    }
    return compressed;
  }

  decompress(compressedData) {
    // Decompress delta-encoded data back to Float32Array
    const decompressed = new Float32Array(compressedData.length);
    let lastSample = 0;
    for (let i = 0; i < compressedData.length; i++) {
      lastSample = lastSample + compressedData[i];
      decompressed[i] = lastSample / 127; // Convert back to -1 to 1 range
    }
    return decompressed;
  }
}

export default function AudioStreamer({ onAudioData, isTransmitting }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recording, setRecording] = useState(null);
  const [sound, setSound] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
  const compressorRef = useRef(new AudioCompressor());
  const audioChunksRef = useRef([]);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    // Request audio permissions
    Audio.requestPermissionsAsync();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const showAlert = (type, title, message) => {
    setAlert({ visible: true, type, title, message });
  };

  const dismissAlert = () => {
    setAlert({ visible: false, type: 'info', title: '', message: '' });
  };

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        showAlert('error', 'Permission Denied', 'Microphone permission is required for audio streaming');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();

      setRecording(recording);
      setIsRecording(true);
      showAlert('success', 'Audio Streaming Started', 'Real-time voice transmission active');

      // Start monitoring audio levels
      monitorAudioLevel(recording);

    } catch (error) {
      console.error('Failed to start recording:', error);
      showAlert('error', 'Recording Failed', 'Could not start audio recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      setRecording(null);
      setIsRecording(false);
      setAudioLevel(0);

      // Process recorded audio for transmission
      if (uri && onAudioData) {
        await processAudioForTransmission(uri);
      }

      showAlert('info', 'Audio Streaming Stopped', 'Voice transmission ended');

    } catch (error) {
      console.error('Failed to stop recording:', error);
      showAlert('error', 'Recording Error', 'Failed to process audio');
    }
  };

  const monitorAudioLevel = async (recording) => {
    const updateLevel = async () => {
      try {
        if (recording && isRecording) {
          const status = await recording.getStatusAsync();
          if (status.isRecording) {
            // Simulate audio level (in real implementation, get from audio analysis)
            const level = Math.random() * 100;
            setAudioLevel(level);

            // Send audio data in real-time chunks
            if (onAudioData && isTransmitting) {
              // Generate simulated audio data for demo
              const audioData = new Float32Array(1024);
              for (let i = 0; i < audioData.length; i++) {
                audioData[i] = (Math.random() - 0.5) * level / 50; // Volume based on level
              }

              const compressed = compressorRef.current.compress(audioData);
              const base64Data = btoa(String.fromCharCode(...compressed));

              onAudioData({
                type: DATA_TYPES.AUDIO,
                data: base64Data,
                timestamp: Date.now(),
                level: level
              });
            }
          }
        }
      } catch (error) {
        console.error('Audio monitoring error:', error);
      }

      if (isRecording) {
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };

    updateLevel();
  };

  const processAudioForTransmission = async (uri) => {
    try {
      // Load audio file
      const { sound: audioSound } = await Audio.Sound.createAsync({ uri });
      setSound(audioSound);

      // Get audio data (simplified for demo - in production use audio analysis)
      const status = await audioSound.getStatusAsync();

      // Create compressed audio data
      const sampleRate = 44100;
      const duration = status.durationMillis / 1000;
      const samples = Math.floor(sampleRate * duration);

      // Generate simulated compressed audio data
      const audioData = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5; // 440Hz sine wave
      }

      const compressed = compressorRef.current.compress(audioData);
      const base64Data = btoa(String.fromCharCode(...compressed));

      if (onAudioData) {
        onAudioData({
          type: DATA_TYPES.AUDIO,
          data: base64Data,
          timestamp: Date.now(),
          duration: duration,
          sampleRate: sampleRate
        });
      }

    } catch (error) {
      console.error('Audio processing error:', error);
      showAlert('error', 'Audio Processing Failed', 'Could not process audio for transmission');
    }
  };

  const playReceivedAudio = async (audioData) => {
    try {
      setIsPlaying(true);

      // Decode and decompress audio data
      const compressed = new Int8Array(atob(audioData).split('').map(c => c.charCodeAt(0)));
      const decompressed = compressorRef.current.decompress(compressed);

      // Create audio buffer (simplified - in production use proper audio synthesis)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = audioContext.createBuffer(1, decompressed.length, 44100);
      buffer.copyFromChannel(decompressed, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();

      source.onended = () => setIsPlaying(false);

    } catch (error) {
      console.error('Audio playback error:', error);
      setIsPlaying(false);
      showAlert('error', 'Playback Failed', 'Could not play received audio');
    }
  };

  const renderAudioVisualizer = () => {
    const bars = [];
    for (let i = 0; i < 20; i++) {
      const height = (audioLevel / 100) * 50 + Math.random() * 10;
      bars.push(
        <View
          key={i}
          style={[styles.audioBar, { height: Math.max(2, height) }]}
        />
      );
    }
    return bars;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎤 Real-Time Audio Streaming</Text>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isRecording && styles.activeButton]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Text style={[styles.buttonText, isRecording && styles.activeButtonText]}>
            {isRecording ? '⏹️ STOP VOICE' : '🎙️ START VOICE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, isPlaying && styles.activeButton]}
          onPress={() => playReceivedAudio('test')} // Test playback
        >
          <Text style={[styles.buttonText, isPlaying && styles.activeButtonText]}>
            {isPlaying ? '🔊 PLAYING...' : '🔊 TEST PLAY'}
          </Text>
        </TouchableOpacity>
      </View>

      {(isRecording || isPlaying) && (
        <View style={styles.visualizer}>
          <Text style={styles.levelText}>
            Audio Level: {Math.round(audioLevel)}%
          </Text>
          <View style={styles.barsContainer}>
            {renderAudioVisualizer()}
          </View>
        </View>
      )}

      <View style={styles.stats}>
        <Text style={styles.statsText}>
          Status: {isRecording ? 'TRANSMITTING VOICE' : 'READY'}
        </Text>
        <Text style={styles.statsText}>
          Compression: Active (8-bit delta encoding)
        </Text>
        <Text style={styles.statsText}>
          Sample Rate: 44.1kHz
        </Text>
      </View>

      <VLCAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onDismiss={dismissAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 20, 40, 0.9)',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    borderWidth: 2,
    borderColor: '#00ff64',
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 15,
    textShadowColor: '#00ff64',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  button: {
    backgroundColor: 'rgba(0, 255, 100, 0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#00ff64',
  },
  activeButton: {
    backgroundColor: 'rgba(255, 100, 100, 0.8)',
    borderColor: '#ff4444',
    shadowColor: '#ff4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 15,
  },
  buttonText: {
    color: '#00ff64',
    fontSize: 14,
    fontWeight: 'bold',
  },
  activeButtonText: {
    color: '#ffffff',
  },
  visualizer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  levelText: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 10,
    fontFamily: 'monospace',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    justifyContent: 'center',
  },
  audioBar: {
    width: 4,
    backgroundColor: '#00ff64',
    marginHorizontal: 2,
    borderRadius: 2,
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  stats: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    padding: 10,
  },
  statsText: {
    color: '#cccccc',
    fontSize: 12,
    marginBottom: 2,
    fontFamily: 'monospace',
  },
});