import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceMotion } from 'expo-sensors';

const { width, height } = Dimensions.get('window');

// Cognitive Load Assessment System
class CognitiveLoadAssessor {
  constructor() {
    this.interactionHistory = [];
    this.cognitiveMetrics = {
      taskCompletionTime: 0,
      errorRate: 0,
      interactionFrequency: 0,
      attentionSpan: 0,
      decisionComplexity: 0,
      stressIndicators: 0
    };

    this.loadThresholds = {
      low: 0.3,
      medium: 0.6,
      high: 0.8
    };
  }

  // Analyze user interactions and environmental factors
  assessCognitiveLoad(interactions, sensors, performance) {
    const recentInteractions = interactions.slice(-20);
    const currentTime = Date.now();

    // Calculate interaction frequency (interactions per minute)
    const timeSpan = currentTime - (recentInteractions[0]?.timestamp || currentTime);
    const interactionFrequency = timeSpan > 0 ? (recentInteractions.length / (timeSpan / 60000)) : 0;

    // Calculate error rate from performance data
    const errorRate = performance.errorRate || 0;

    // Assess task completion patterns
    const avgCompletionTime = recentInteractions.length > 0
      ? recentInteractions.reduce((sum, i) => sum + (i.duration || 0), 0) / recentInteractions.length
      : 0;

    // Calculate attention span based on sustained interactions
    const sustainedInteractions = recentInteractions.filter(i =>
      i.duration && i.duration > 5000 // Interactions longer than 5 seconds
    ).length;
    const attentionSpan = recentInteractions.length > 0 ? sustainedInteractions / recentInteractions.length : 0;

    // Assess decision complexity based on interaction types
    const complexDecisions = recentInteractions.filter(i =>
      i.type === 'optimization_toggle' || i.type === 'advanced_settings'
    ).length;
    const decisionComplexity = recentInteractions.length > 0 ? complexDecisions / recentInteractions.length : 0;

    // Calculate stress indicators from sensor data
    const stressIndicators = this.calculateStressIndicators(sensors);

    // Update cognitive metrics
    this.cognitiveMetrics = {
      taskCompletionTime: avgCompletionTime,
      errorRate: errorRate,
      interactionFrequency: interactionFrequency,
      attentionSpan: attentionSpan,
      decisionComplexity: decisionComplexity,
      stressIndicators: stressIndicators
    };

    return this.calculateOverallLoad();
  }

  calculateStressIndicators(sensors) {
    if (!sensors.accelerometer) return 0;

    const { x, y, z } = sensors.accelerometer;
    const acceleration = Math.sqrt(x * x + y * y + z * z);

    // Higher acceleration indicates potential stress/shakiness
    const normalizedAcceleration = Math.min(acceleration / 20, 1);

    // Combine with other potential stress indicators
    return normalizedAcceleration;
  }

  calculateOverallLoad() {
    const metrics = this.cognitiveMetrics;
    const weights = {
      errorRate: 0.25,
      interactionFrequency: 0.15,
      attentionSpan: 0.2,
      decisionComplexity: 0.15,
      stressIndicators: 0.25
    };

    const loadScore =
      (metrics.errorRate * weights.errorRate) +
      (Math.min(metrics.interactionFrequency / 10, 1) * weights.interactionFrequency) +
      ((1 - metrics.attentionSpan) * weights.attentionSpan) +
      (metrics.decisionComplexity * weights.decisionComplexity) +
      (metrics.stressIndicators * weights.stressIndicators);

    // Determine load level
    if (loadScore >= this.loadThresholds.high) return { level: 'high', score: loadScore };
    if (loadScore >= this.loadThresholds.medium) return { level: 'medium', score: loadScore };
    if (loadScore >= this.loadThresholds.low) return { level: 'low', score: loadScore };
    return { level: 'minimal', score: loadScore };
  }

  // Generate UI adaptation recommendations
  getUIAdaptations(loadLevel) {
    switch (loadLevel) {
      case 'high':
        return {
          complexity: 'minimal',
          feedback: 'immediate',
          controls: 'simplified',
          information: 'essential_only',
          animations: 'reduced',
          colors: 'high_contrast'
        };

      case 'medium':
        return {
          complexity: 'moderate',
          feedback: 'balanced',
          controls: 'standard',
          information: 'important',
          animations: 'standard',
          colors: 'normal'
        };

      case 'low':
        return {
          complexity: 'full',
          feedback: 'detailed',
          controls: 'advanced',
          information: 'comprehensive',
          animations: 'enhanced',
          colors: 'vibrant'
        };

      default: // minimal
        return {
          complexity: 'full',
          feedback: 'minimal',
          controls: 'expert',
          information: 'verbose',
          animations: 'rich',
          colors: 'dynamic'
        };
    }
  }

  // Log user interaction for learning
  logInteraction(type, duration, success = true) {
    this.interactionHistory.push({
      type,
      duration,
      success,
      timestamp: Date.now()
    });

    // Keep only recent history
    if (this.interactionHistory.length > 100) {
      this.interactionHistory = this.interactionHistory.slice(-100);
    }
  }
}

export default function CognitiveLoadAdaptiveInterface({
  children,
  onLoadChange,
  enableAdaptiveUI = true
}) {
  const [assessor] = useState(() => new CognitiveLoadAssessor());
  const [cognitiveLoad, setCognitiveLoad] = useState({ level: 'minimal', score: 0 });
  const [uiAdaptations, setUIAdaptations] = useState({});
  const [sensors, setSensors] = useState({});
  const [performanceMetrics, setPerformanceMetrics] = useState({
    errorRate: 0,
    successRate: 1.0
  });
  const intervalRef = useRef(null);

  useEffect(() => {
    // Load historical interaction data
    const loadInteractionHistory = async () => {
      try {
        const data = await AsyncStorage.getItem('vlc_cognitive_history');
        if (data) {
          assessor.interactionHistory = JSON.parse(data);
        }
      } catch (error) {
        console.error('Failed to load interaction history:', error);
      }
    };
    loadInteractionHistory();

    // Start sensor monitoring
    DeviceMotion.setUpdateInterval(1000);
    const subscription = DeviceMotion.addListener((data) => {
      setSensors(prev => ({ ...prev, accelerometer: data.accelerationIncludingGravity }));
    });

    // Start cognitive assessment loop
    intervalRef.current = setInterval(() => {
      const load = assessor.assessCognitiveLoad(assessor.interactionHistory, sensors, performanceMetrics);
      setCognitiveLoad(load);

      const adaptations = assessor.getUIAdaptations(load.level);
      setUIAdaptations(adaptations);

      if (onLoadChange) {
        onLoadChange(load, adaptations);
      }
    }, 3000);

    return () => {
      subscription?.remove();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sensors, performanceMetrics]);

  // Save interaction history periodically
  useEffect(() => {
    const saveHistory = () => {
      AsyncStorage.setItem('vlc_cognitive_history', JSON.stringify(assessor.interactionHistory))
        .catch(console.error);
    };

    const saveInterval = setInterval(saveHistory, 10000); // Save every 10 seconds
    return () => clearInterval(saveInterval);
  }, []);

  // Create adaptive wrapper for children
  const AdaptiveWrapper = ({ children }) => {
    if (!enableAdaptiveUI) return children;

    const adaptiveStyles = getAdaptiveStyles(uiAdaptations, cognitiveLoad);

    return (
      <View style={adaptiveStyles.container}>
        {children}
        {renderLoadIndicator()}
      </View>
    );
  };

  const getAdaptiveStyles = (adaptations, load) => {
    const baseStyles = {
      container: {
        opacity: adaptations.complexity === 'minimal' ? 0.9 : 1.0,
      }
    };

    // Apply cognitive load-based styling
    switch (load.level) {
      case 'high':
        return {
          ...baseStyles,
          container: {
            ...baseStyles.container,
            backgroundColor: 'rgba(255, 100, 100, 0.05)', // Subtle red tint for high load
          }
        };

      case 'medium':
        return {
          ...baseStyles,
          container: {
            ...baseStyles.container,
            backgroundColor: 'rgba(255, 255, 100, 0.03)', // Subtle yellow tint
          }
        };

      default:
        return baseStyles;
    }
  };

  const renderLoadIndicator = () => {
    if (!enableAdaptiveUI) return null;

    const loadColors = {
      high: '#ff4444',
      medium: '#ffaa44',
      low: '#44ff44',
      minimal: '#4444ff'
    };

    return (
      <View style={[styles.loadIndicator, { backgroundColor: loadColors[cognitiveLoad.level] }]}>
        <Text style={styles.loadText}>
          Cognitive Load: {cognitiveLoad.level.toUpperCase()}
        </Text>
        <Text style={styles.loadScore}>
          {Math.round(cognitiveLoad.score * 100)}%
        </Text>
      </View>
    );
  };

  // Context for child components to access cognitive state
  const contextValue = {
    cognitiveLoad,
    uiAdaptations,
    logInteraction: (type, duration, success) => assessor.logInteraction(type, duration, success),
    updatePerformance: (metrics) => setPerformanceMetrics(prev => ({ ...prev, ...metrics }))
  };

  return (
    <CognitiveLoadContext.Provider value={contextValue}>
      <AdaptiveWrapper>
        {children}
      </AdaptiveWrapper>
    </CognitiveLoadContext.Provider>
  );
}

// Context for sharing cognitive load state
export const CognitiveLoadContext = React.createContext();

// Hook for components to access cognitive load data
export const useCognitiveLoad = () => {
  const context = React.useContext(CognitiveLoadContext);
  if (!context) {
    throw new Error('useCognitiveLoad must be used within CognitiveLoadAdaptiveInterface');
  }
  return context;
};

const styles = StyleSheet.create({
  loadIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  loadText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginRight: 4,
  },
  loadScore: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});