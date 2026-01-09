import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// Predictive Interference Compensation System
class InterferencePredictor {
  constructor() {
    this.interferenceHistory = [];
    this.patterns = new Map();
    this.kalmanFilter = {
      state: [0, 0], // [brightness, rate_of_change]
      covariance: [[1, 0], [0, 1]],
      processNoise: 0.1,
      measurementNoise: 0.5
    };

    this.predictionHorizon = 10; // Predict 10 samples ahead
    this.adaptationRate = 0.3;
  }

  // Kalman filter prediction and update
  predictInterference(currentBrightness, timestamp) {
    // Store measurement for pattern analysis
    this.interferenceHistory.push({
      brightness: currentBrightness,
      timestamp: timestamp,
      predicted: false
    });

    // Keep only recent history
    if (this.interferenceHistory.length > 200) {
      this.interferenceHistory = this.interferenceHistory.slice(-200);
    }

    // Update Kalman filter
    this.kalmanUpdate(currentBrightness);

    // Analyze interference patterns
    const patterns = this.analyzePatterns();

    // Generate predictions
    const predictions = this.generatePredictions(patterns, timestamp);

    return {
      currentState: this.kalmanFilter.state,
      predictions: predictions,
      confidence: this.calculateConfidence(patterns),
      recommendedThreshold: this.calculateAdaptiveThreshold(predictions)
    };
  }

  kalmanUpdate(measurement) {
    const { state, covariance, processNoise, measurementNoise } = this.kalmanFilter;

    // Prediction step
    const predictedState = [
      state[0] + state[1], // brightness + rate_of_change
      state[1] // rate_of_change stays constant
    ];

    const predictedCovariance = [
      [covariance[0][0] + covariance[0][1] + covariance[1][0] + covariance[1][1] + processNoise, covariance[0][1] + covariance[1][1]],
      [covariance[1][0] + covariance[1][1], covariance[1][1] + processNoise]
    ];

    // Update step
    const innovation = measurement - predictedState[0];
    const innovationCovariance = predictedCovariance[0][0] + measurementNoise;

    const kalmanGain = [
      predictedCovariance[0][0] / innovationCovariance,
      predictedCovariance[1][0] / innovationCovariance
    ];

    // Update state
    this.kalmanFilter.state = [
      predictedState[0] + kalmanGain[0] * innovation,
      predictedState[1] + kalmanGain[1] * innovation
    ];

    // Update covariance
    const temp = 1 - kalmanGain[0];
    this.kalmanFilter.covariance = [
      [temp * predictedCovariance[0][0], temp * predictedCovariance[0][1]],
      [temp * predictedCovariance[1][0] - kalmanGain[0] * predictedCovariance[1][0], temp * predictedCovariance[1][1] - kalmanGain[0] * predictedCovariance[1][1]]
    ];
  }

  analyzePatterns() {
    const recent = this.interferenceHistory.slice(-50);
    const patterns = {
      sinusoidal: this.detectSinusoidalPattern(recent),
      stepChanges: this.detectStepChanges(recent),
      noise: this.calculateNoiseLevel(recent),
      periodicity: this.detectPeriodicity(recent)
    };

    return patterns;
  }

  detectSinusoidalPattern(data) {
    if (data.length < 20) return { detected: false, amplitude: 0, frequency: 0 };

    // Simple autocorrelation for periodicity detection
    const values = data.map(d => d.brightness);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    // Find peaks and valleys
    let peaks = 0, valleys = 0;
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i-1] && values[i] > values[i+1]) peaks++;
      if (values[i] < values[i-1] && values[i] < values[i+1]) valleys++;
    }

    const amplitude = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
    const isSinusoidal = (peaks + valleys) > 4 && amplitude > 10;

    return {
      detected: isSinusoidal,
      amplitude: amplitude,
      frequency: (peaks + valleys) / (data.length * 0.1) // Rough frequency estimate
    };
  }

  detectStepChanges(data) {
    const changes = [];
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i].brightness - data[i-1].brightness);
      if (diff > 30) { // Significant change threshold
        changes.push({
          index: i,
          magnitude: diff,
          direction: data[i].brightness > data[i-1].brightness ? 'up' : 'down'
        });
      }
    }
    return changes;
  }

  calculateNoiseLevel(data) {
    if (data.length < 5) return 0;

    const values = data.map(d => d.brightness);
    const diffs = [];
    for (let i = 1; i < values.length; i++) {
      diffs.push(Math.abs(values[i] - values[i-1]));
    }

    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  detectPeriodicity(data) {
    if (data.length < 30) return { detected: false, period: 0 };

    // Autocorrelation for periodicity
    const values = data.map(d => d.brightness);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const normalized = values.map(v => v - mean);

    let maxCorrelation = 0;
    let bestPeriod = 0;

    // Test periods from 5 to 25 samples
    for (let period = 5; period <= 25; period++) {
      let correlation = 0;
      let count = 0;

      for (let i = 0; i < values.length - period; i++) {
        correlation += normalized[i] * normalized[i + period];
        count++;
      }

      correlation /= count;
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }

    return {
      detected: maxCorrelation > 0.3,
      period: bestPeriod,
      strength: maxCorrelation
    };
  }

  generatePredictions(patterns, currentTime) {
    const predictions = [];

    for (let i = 1; i <= this.predictionHorizon; i++) {
      const futureTime = currentTime + (i * 100); // 100ms per sample
      let predictedBrightness = this.kalmanFilter.state[0] + (this.kalmanFilter.state[1] * i);

      // Apply pattern-based corrections
      if (patterns.sinusoidal.detected) {
        const phase = (futureTime * patterns.sinusoidal.frequency * 2 * Math.PI) / 1000;
        predictedBrightness += patterns.sinusoidal.amplitude * Math.sin(phase);
      }

      if (patterns.periodicity.detected) {
        const phase = (i * 2 * Math.PI) / patterns.periodicity.period;
        predictedBrightness += 20 * Math.sin(phase) * patterns.periodicity.strength;
      }

      predictions.push({
        time: futureTime,
        brightness: Math.max(0, Math.min(255, predictedBrightness)),
        confidence: Math.max(0.1, 1 - (i * 0.1)) // Confidence decreases with distance
      });
    }

    return predictions;
  }

  calculateConfidence(patterns) {
    let confidence = 0.5; // Base confidence

    if (patterns.sinusoidal.detected) confidence += 0.2;
    if (patterns.periodicity.detected) confidence += 0.15;
    if (patterns.noise < 15) confidence += 0.1; // Low noise = high predictability

    return Math.min(0.95, confidence);
  }

  calculateAdaptiveThreshold(predictions) {
    if (predictions.length === 0) return 128;

    // Calculate expected brightness range from predictions
    const brightnesses = predictions.map(p => p.brightness);
    const min = Math.min(...brightnesses);
    const max = Math.max(...brightnesses);
    const range = max - min;

    // Adaptive threshold based on predicted range
    const baseThreshold = (min + max) / 2;
    const margin = range * 0.1; // 10% margin

    return Math.max(10, Math.min(245, baseThreshold - margin));
  }

  // Apply compensation to received signal
  compensateSignal(receivedBrightness, predictedBrightness, confidence) {
    if (confidence < 0.3) return receivedBrightness; // Not confident enough to compensate

    // Weighted average between received and predicted
    const compensationWeight = confidence * this.adaptationRate;
    return receivedBrightness * (1 - compensationWeight) + predictedBrightness * compensationWeight;
  }
}

export default function PredictiveSignalInterferenceCompensation({
  currentBrightness,
  onCompensation,
  enablePrediction = true
}) {
  const [predictor] = useState(() => new InterferencePredictor());
  const [compensation, setCompensation] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enablePrediction) return;

    // Start prediction loop
    intervalRef.current = setInterval(() => {
      const result = predictor.predictInterference(currentBrightness, Date.now());

      setPredictions(result.predictions);

      // Calculate compensated brightness
      const compensated = predictor.compensateSignal(
        currentBrightness,
        result.predictions[0]?.brightness || currentBrightness,
        result.confidence
      );

      const compensationData = {
        originalBrightness: currentBrightness,
        compensatedBrightness: compensated,
        threshold: result.recommendedThreshold,
        confidence: result.confidence,
        predictions: result.predictions
      };

      setCompensation(compensationData);

      if (onCompensation) {
        onCompensation(compensationData);
      }
    }, 100); // 100ms prediction cycle

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentBrightness, enablePrediction]);

  const renderPredictionGraph = () => {
    if (!predictions.length) return null;

    return (
      <View style={styles.predictionContainer}>
        <Text style={styles.sectionTitle}>Interference Predictions</Text>
        <View style={styles.graphContainer}>
          {predictions.slice(0, 5).map((pred, index) => (
            <View key={index} style={styles.predictionBar}>
              <View
                style={[
                  styles.predictionFill,
                  {
                    height: `${(pred.brightness / 255) * 100}%`,
                    opacity: pred.confidence
                  }
                ]}
              />
              <Text style={styles.predictionLabel}>
                {index + 1}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.graphLabel}>Future Samples (100ms intervals)</Text>
      </View>
    );
  };

  const renderCompensationMetrics = () => {
    if (!compensation) return null;

    const compensationDiff = Math.abs(compensation.compensatedBrightness - compensation.originalBrightness);

    return (
      <View style={styles.metricsContainer}>
        <Text style={styles.sectionTitle}>Signal Compensation</Text>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Original:</Text>
          <Text style={styles.metricValue}>{Math.round(compensation.originalBrightness)}</Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Compensated:</Text>
          <Text style={styles.metricValue}>{Math.round(compensation.compensatedBrightness)}</Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Correction:</Text>
          <Text style={[styles.metricValue, { color: compensationDiff > 5 ? '#00ff64' : '#cccccc' }]}>
            {compensationDiff > 5 ? `${Math.round(compensationDiff)} units` : 'Minimal'}
          </Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Adaptive Threshold:</Text>
          <Text style={styles.metricValue}>{Math.round(compensation.threshold)}</Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Prediction Confidence:</Text>
          <Text style={styles.metricValue}>{Math.round(compensation.confidence * 100)}%</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Predictive Interference Compensation</Text>

      {renderCompensationMetrics()}
      {renderPredictionGraph()}

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {compensation ? 'Active' : 'Analyzing'}
        </Text>
        <Text style={styles.algorithmText}>
          Kalman Filter + Pattern Recognition
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(30, 60, 90, 0.9)',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    borderWidth: 2,
    borderColor: '#0066cc',
    shadowColor: '#0066cc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 15,
    textShadowColor: '#0066cc',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  metricsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricLabel: {
    color: '#cccccc',
    fontSize: 13,
  },
  metricValue: {
    color: '#00aaff',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  predictionContainer: {
    marginBottom: 15,
  },
  graphContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 80,
    marginBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 10,
  },
  predictionBar: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 2,
  },
  predictionFill: {
    backgroundColor: '#00aaff',
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  predictionLabel: {
    color: '#cccccc',
    fontSize: 10,
    marginTop: 4,
  },
  graphLabel: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  statusText: {
    color: '#00aaff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  algorithmText: {
    color: '#666666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});