import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function SignalIndicator({ isActive, bitValue, syncStatus = 'waiting' }) {
  const [pulseAnim] = useState(new Animated.Value(1));
  const [bitAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isActive) {
      // Pulse animation for active signal
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive]);

  useEffect(() => {
    // Bit transition animation
    Animated.timing(bitAnim, {
      toValue: bitValue ? 1 : 0,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [bitValue]);

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'synced': return '#00ff64';
      case 'syncing': return '#ffa500';
      case 'error': return '#ff0032';
      default: return '#666666';
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'synced': return 'SYNCED';
      case 'syncing': return 'SYNCING...';
      case 'error': return 'NO SYNC';
      default: return 'WAITING';
    }
  };

  const backgroundColor = bitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#000000', '#ffffff']
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.signalCircle,
          {
            transform: [{ scale: pulseAnim }],
            backgroundColor: isActive ? '#00ff64' : '#333333',
          }
        ]}
      >
        <Animated.View
          style={[
            styles.bitIndicator,
            { backgroundColor }
          ]}
        />
      </Animated.View>

      <View style={styles.statusContainer}>
        <Text style={[styles.statusText, { color: getSyncStatusColor() }]}>
          {getSyncStatusText()}
        </Text>
        <Text style={styles.bitValueText}>
          Bit: {bitValue ? '1' : '0'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  signalCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  bitIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  statusContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bitValueText: {
    fontSize: 12,
    color: '#cccccc',
    fontFamily: 'monospace',
  },
});