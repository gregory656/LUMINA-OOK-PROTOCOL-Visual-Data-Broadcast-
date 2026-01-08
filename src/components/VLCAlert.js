import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const ALERT_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

const ALERT_STYLES = {
  [ALERT_TYPES.SUCCESS]: {
    backgroundColor: 'rgba(0, 255, 100, 0.9)',
    borderColor: '#00ff64',
    shadowColor: '#00ff64',
    icon: '✓'
  },
  [ALERT_TYPES.ERROR]: {
    backgroundColor: 'rgba(255, 0, 50, 0.9)',
    borderColor: '#ff0032',
    shadowColor: '#ff0032',
    icon: '✕'
  },
  [ALERT_TYPES.WARNING]: {
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
    borderColor: '#ffa500',
    shadowColor: '#ffa500',
    icon: '⚠'
  },
  [ALERT_TYPES.INFO]: {
    backgroundColor: 'rgba(0, 150, 255, 0.9)',
    borderColor: '#0096ff',
    shadowColor: '#0096ff',
    icon: 'ℹ'
  }
};

export default function VLCAlert({ visible, type = ALERT_TYPES.INFO, title, message, onDismiss, autoDismiss = true, duration = 3000 }) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        })
      ]).start();

      // Auto dismiss if enabled
      if (autoDismiss && duration > 0) {
        const timer = setTimeout(() => {
          dismiss();
        }, duration);
        return () => clearTimeout(timer);
      }
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      if (onDismiss) onDismiss();
    });
  };

  if (!visible) return null;

  const style = ALERT_STYLES[type] || ALERT_STYLES[ALERT_TYPES.INFO];

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }]
        }
      ]}
    >
      <View style={[styles.alertContainer, { borderColor: style.borderColor, shadowColor: style.shadowColor }]}>
        <View style={styles.alertContent}>
          <Text style={styles.icon}>{style.icon}</Text>
          <View style={styles.textContainer}>
            {title && <Text style={styles.title}>{title}</Text>}
            {message && <Text style={styles.message}>{message}</Text>}
          </View>
          <TouchableOpacity style={styles.dismissButton} onPress={dismiss}>
            <Text style={styles.dismissIcon}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  alertContainer: {
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    borderWidth: 2,
    borderRadius: 12,
    margin: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 10,
    minWidth: width * 0.8,
    maxWidth: width * 0.9,
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  icon: {
    fontSize: 24,
    marginRight: 15,
    color: '#ffffff',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  message: {
    fontSize: 14,
    color: '#cccccc',
    lineHeight: 20,
  },
  dismissButton: {
    padding: 5,
    marginLeft: 10,
  },
  dismissIcon: {
    fontSize: 24,
    color: '#888888',
  },
});