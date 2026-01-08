import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, PanGestureHandler, State } from 'react-native';
import { PanGestureHandlerGestureEvent, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Advanced gesture recognition system
class GestureRecognizer {
  constructor() {
    this.gestureHistory = [];
    this.recognizedGestures = {
      SWIPE_UP: 'TRANSMIT_START',
      SWIPE_DOWN: 'TRANSMIT_STOP',
      CIRCLE_CLOCKWISE: 'INCREASE_BITRATE',
      CIRCLE_COUNTERCLOCKWISE: 'DECREASE_BITRATE',
      TAP_DOUBLE: 'EMERGENCY_MODE',
      PINCH_IN: 'ZOOM_CAMERA',
      PINCH_OUT: 'RESET_VIEW',
      LONG_PRESS: 'PAUSE_TRANSMISSION'
    };

    this.confidenceThreshold = 0.75;
    this.gestureTimeout = 2000; // 2 seconds
  }

  // Analyze touch/movement patterns
  analyzeGesture(touchPoints, velocity, direction) {
    const gesture = {
      type: 'UNKNOWN',
      confidence: 0,
      timestamp: Date.now(),
      data: { touchPoints, velocity, direction }
    };

    // Store gesture history for pattern recognition
    this.gestureHistory.push(gesture);
    if (this.gestureHistory.length > 50) {
      this.gestureHistory.shift();
    }

    // Simple gesture recognition (would use ML in production)
    if (Math.abs(velocity.y) > 500 && direction === 'up') {
      gesture.type = 'SWIPE_UP';
      gesture.confidence = Math.min(1.0, Math.abs(velocity.y) / 1000);
    } else if (Math.abs(velocity.y) > 500 && direction === 'down') {
      gesture.type = 'SWIPE_DOWN';
      gesture.confidence = Math.min(1.0, Math.abs(velocity.y) / 1000);
    } else if (Math.abs(velocity.x) > 300 && Math.abs(velocity.y) > 300) {
      // Circular motion detection
      const radius = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
      if (velocity.x > 0 && velocity.y > 0) {
        gesture.type = 'CIRCLE_CLOCKWISE';
      } else {
        gesture.type = 'CIRCLE_COUNTERCLOCKWISE';
      }
      gesture.confidence = Math.min(1.0, radius / 600);
    } else if (touchPoints === 2 && Math.abs(velocity.x) < 50 && Math.abs(velocity.y) < 50) {
      gesture.type = 'LONG_PRESS';
      gesture.confidence = 0.9;
    }

    return gesture;
  }

  // Get command from recognized gesture
  getCommand(gesture) {
    if (gesture.confidence < this.confidenceThreshold) {
      return { command: 'UNKNOWN', confidence: gesture.confidence };
    }

    const command = this.recognizedGestures[gesture.type] || 'UNKNOWN';
    return {
      command,
      confidence: gesture.confidence,
      gesture: gesture.type,
      data: gesture.data
    };
  }

  // Learn from user corrections
  learnCorrection(actualCommand, predictedGesture) {
    // In production, this would update ML model weights
    console.log(`Learning: ${predictedGesture} -> ${actualCommand}`);
  }

  // Get gesture statistics
  getStats() {
    const recentGestures = this.gestureHistory.slice(-20);
    const gestureCounts = {};

    recentGestures.forEach(g => {
      gestureCounts[g.type] = (gestureCounts[g.type] || 0) + 1;
    });

    return {
      totalGestures: this.gestureHistory.length,
      recentStats: gestureCounts,
      accuracy: recentGestures.filter(g => g.confidence > this.confidenceThreshold).length / recentGestures.length
    };
  }
}

export default function GestureController({ onGestureCommand, isActive = true }) {
  const [recognizer] = useState(() => new GestureRecognizer());
  const [lastGesture, setLastGesture] = useState(null);
  const [gestureStats, setGestureStats] = useState({});
  const [isGestureMode, setIsGestureMode] = useState(false);

  // Animated values for gesture feedback
  const gestureIndicatorOpacity = useSharedValue(0);
  const gestureIndicatorScale = useSharedValue(1);
  const gestureRingRotation = useSharedValue(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setGestureStats(recognizer.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Gesture handler for pan gestures
  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, context) => {
      context.startTime = Date.now();
      context.startX = _.x;
      context.startY = _.y;
    },
    onActive: (event, context) => {
      const deltaX = event.translationX;
      const deltaY = event.translationY;
      const velocityX = event.velocityX;
      const velocityY = event.velocityY;

      // Determine direction
      let direction = 'unknown';
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        direction = deltaY > 0 ? 'down' : 'up';
      } else {
        direction = deltaX > 0 ? 'right' : 'left';
      }

      // Analyze gesture
      const gesture = recognizer.analyzeGesture(
        1, // Single touch
        { x: velocityX, y: velocityY },
        direction
      );

      if (gesture.type !== 'UNKNOWN') {
        runOnJS(setLastGesture)(gesture);

        // Visual feedback
        gestureIndicatorOpacity.value = withSpring(1);
        gestureIndicatorScale.value = withSpring(1.2);

        // Execute command
        const command = recognizer.getCommand(gesture);
        if (command.command !== 'UNKNOWN' && onGestureCommand) {
          runOnJS(onGestureCommand)(command);
        }

        // Hide feedback after delay
        setTimeout(() => {
          gestureIndicatorOpacity.value = withSpring(0);
          gestureIndicatorScale.value = withSpring(1);
        }, 1500);
      }
    },
    onEnd: () => {
      // Reset visual feedback
      gestureIndicatorOpacity.value = withSpring(0);
      gestureIndicatorScale.value = withSpring(1);
    },
  });

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    opacity: gestureIndicatorOpacity.value,
    transform: [{ scale: gestureIndicatorScale.value }]
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${gestureRingRotation.value}deg` }]
  }));

  const toggleGestureMode = () => {
    setIsGestureMode(!isGestureMode);
    if (!isGestureMode) {
      // Start gesture recognition
      gestureRingRotation.value = withSpring(360, { duration: 2000 });
    }
  };

  const renderGestureFeedback = () => {
    if (!lastGesture || !isGestureMode) return null;

    const command = recognizer.getCommand(lastGesture);
    const confidencePercent = Math.round(command.confidence * 100);

    return (
      <Animated.View style={[styles.gestureFeedback, animatedIndicatorStyle]}>
        <Text style={styles.gestureText}>
          {command.command.replace('_', ' ')}
        </Text>
        <Text style={styles.confidenceText}>
          {confidencePercent}% confidence
        </Text>
      </Animated.View>
    );
  };

  const renderGestureRing = () => {
    if (!isGestureMode) return null;

    return (
      <Animated.View style={[styles.gestureRing, animatedRingStyle]}>
        <View style={styles.ringInner} />
      </Animated.View>
    );
  };

  const renderGestureStats = () => {
    return (
      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>🎯 Gesture Stats</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Total Gestures</Text>
            <Text style={styles.statValue}>{gestureStats.totalGestures || 0}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Accuracy</Text>
            <Text style={styles.statValue}>
              {gestureStats.accuracy ? Math.round(gestureStats.accuracy * 100) : 0}%
            </Text>
          </View>
        </View>

        <Text style={styles.instructionsTitle}>📋 Available Gestures</Text>
        <View style={styles.gestureList}>
          <Text style={styles.gestureItem}>• Swipe Up: Start Transmission</Text>
          <Text style={styles.gestureItem}>• Swipe Down: Stop Transmission</Text>
          <Text style={styles.gestureItem}>• Circle Clockwise: Increase Bitrate</Text>
          <Text style={styles.gestureItem}>• Circle Counter: Decrease Bitrate</Text>
          <Text style={styles.gestureItem}>• Double Tap: Emergency Mode</Text>
          <Text style={styles.gestureItem}>• Long Press: Pause Transmission</Text>
        </View>
      </View>
    );
  };

  return (
    <PanGestureHandler onGestureEvent={gestureHandler} enabled={isGestureMode && isActive}>
      <Animated.View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>👋 Gesture Control</Text>
          <TouchableOpacity
            style={[styles.modeButton, isGestureMode && styles.activeModeButton]}
            onPress={toggleGestureMode}
          >
            <Text style={[styles.modeButtonText, isGestureMode && styles.activeModeButtonText]}>
              {isGestureMode ? '🎯 ACTIVE' : '⚪ INACTIVE'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.gestureArea}>
          {renderGestureRing()}
          {renderGestureFeedback()}

          {!isGestureMode && (
            <View style={styles.inactiveMessage}>
              <Text style={styles.inactiveText}>
                Tap to activate gesture control
              </Text>
              <Text style={styles.inactiveSubtext}>
                Control transmission with hand movements
              </Text>
            </View>
          )}
        </View>

        {renderGestureStats()}
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(60, 80, 100, 0.9)',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    borderWidth: 2,
    borderColor: '#00aaff',
    shadowColor: '#00aaff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: '#00aaff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  modeButton: {
    backgroundColor: 'rgba(0, 170, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#00aaff',
  },
  activeModeButton: {
    backgroundColor: 'rgba(0, 255, 170, 0.8)',
    borderColor: '#00ffaa',
  },
  modeButtonText: {
    color: '#00aaff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  activeModeButtonText: {
    color: '#ffffff',
  },
  gestureArea: {
    height: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  gestureRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#00aaff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(0, 170, 255, 0.5)',
  },
  gestureFeedback: {
    backgroundColor: 'rgba(0, 170, 255, 0.9)',
    borderRadius: 15,
    padding: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  gestureText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  confidenceText: {
    color: '#ffffff',
    fontSize: 12,
    opacity: 0.8,
  },
  inactiveMessage: {
    alignItems: 'center',
  },
  inactiveText: {
    color: '#cccccc',
    fontSize: 16,
    marginBottom: 5,
  },
  inactiveSubtext: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
  },
  statsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 10,
    padding: 15,
  },
  statsTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    color: '#cccccc',
    fontSize: 12,
    marginBottom: 5,
  },
  statValue: {
    color: '#00aaff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  instructionsTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  gestureList: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 10,
  },
  gestureItem: {
    color: '#cccccc',
    fontSize: 11,
    marginBottom: 3,
    lineHeight: 16,
  },
});