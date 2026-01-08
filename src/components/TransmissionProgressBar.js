import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function TransmissionProgressBar({
  progress = 0,
  totalBits = 0,
  transmittedBits = 0,
  bitrate = 0,
  estimatedTimeRemaining = 0
}) {
  const [progressAnim] = useState(new Animated.Value(0));
  const [glowAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (progress > 0) {
      // Glow effect during transmission
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          })
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [progress > 0]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8]
  });

  const formatTime = (milliseconds) => {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const formatBitrate = (bps) => {
    if (bps < 1000) return `${bps} bps`;
    return `${(bps / 1000).toFixed(1)} kbps`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressWidth,
              shadowOpacity: glowOpacity,
            }
          ]}
        />
        <Animated.View
          style={[
            styles.progressGlow,
            {
              width: progressWidth,
              opacity: glowOpacity,
            }
          ]}
        />
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Progress:</Text>
          <Text style={styles.statValue}>{Math.round(progress * 100)}%</Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Bits:</Text>
          <Text style={styles.statValue}>{transmittedBits}/{totalBits}</Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Bitrate:</Text>
          <Text style={styles.statValue}>{formatBitrate(bitrate)}</Text>
        </View>

        {estimatedTimeRemaining > 0 && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>ETA:</Text>
            <Text style={styles.statValue}>{formatTime(estimatedTimeRemaining)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  progressContainer: {
    height: 20,
    backgroundColor: 'rgba(50, 50, 60, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00ff64',
    borderRadius: 9,
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 5,
  },
  progressGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: '#00ff64',
    borderRadius: 9,
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    elevation: 10,
  },
  statsContainer: {
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    borderRadius: 8,
    padding: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statLabel: {
    color: '#cccccc',
    fontSize: 14,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});