import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// Multi-Scale Temporal Error Correction System
class TemporalErrorCorrector {
  constructor() {
    this.errorHistory = [];
    this.correctionHistory = [];
    this.scales = {
      micro: { window: 10, threshold: 0.3 },    // Bit-level (10 samples)
      meso: { window: 50, threshold: 0.4 },     // Packet-level (50 samples)
      macro: { window: 200, threshold: 0.5 }    // Transmission-level (200 samples)
    };

    this.fractalDimension = 1.5; // Default fractal dimension for noise analysis
    this.adaptiveThresholds = {
      micro: 0.3,
      meso: 0.4,
      macro: 0.5
    };
  }

  // Analyze signal at multiple temporal scales
  analyzeMultiScaleErrors(signalData, timestamp) {
    const analysis = {
      microScale: this.analyzeMicroScale(signalData.slice(-this.scales.micro.window)),
      mesoScale: this.analyzeMesoScale(signalData.slice(-this.scales.meso.window)),
      macroScale: this.analyzeMacroScale(signalData.slice(-this.scales.macro.window)),
      fractalAnalysis: this.calculateFractalDimension(signalData),
      temporalPatterns: this.detectTemporalPatterns(signalData)
    };

    // Store analysis for learning
    this.errorHistory.push({
      timestamp,
      analysis,
      signalData: signalData.slice(-50) // Keep last 50 samples
    });

    if (this.errorHistory.length > 100) {
      this.errorHistory.shift();
    }

    return analysis;
  }

  analyzeMicroScale(data) {
    if (data.length < 5) return { errorRate: 0, patterns: [], confidence: 0 };

    // Detect bit-level errors (rapid changes, noise spikes)
    let errorCount = 0;
    const patterns = [];

    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i] - data[i-1]);
      if (diff > 50) { // Significant change threshold
        errorCount++;
        patterns.push({
          index: i,
          magnitude: diff,
          type: 'spike'
        });
      }
    }

    const errorRate = errorCount / data.length;

    // Detect oscillation patterns (alternating high/low)
    let oscillations = 0;
    for (let i = 2; i < data.length; i++) {
      if ((data[i-2] < data[i-1] && data[i-1] > data[i]) ||
          (data[i-2] > data[i-1] && data[i-1] < data[i])) {
        oscillations++;
      }
    }

    return {
      errorRate,
      patterns,
      oscillations: oscillations / data.length,
      confidence: Math.min(1.0, data.length / this.scales.micro.window)
    };
  }

  analyzeMesoScale(data) {
    if (data.length < 20) return { errorRate: 0, trends: [], confidence: 0 };

    // Detect packet-level errors (sustained deviations, trends)
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);

    // Detect sustained deviations from mean
    const deviations = data.map((val, index) => ({
      index,
      value: val,
      deviation: Math.abs(val - mean) / stdDev,
      isError: Math.abs(val - mean) > 2 * stdDev
    }));

    const errorRate = deviations.filter(d => d.isError).length / data.length;

    // Detect trends (increasing/decreasing patterns)
    const trends = this.detectTrends(data);

    return {
      errorRate,
      trends,
      mean,
      stdDev,
      confidence: Math.min(1.0, data.length / this.scales.meso.window)
    };
  }

  analyzeMacroScale(data) {
    if (data.length < 50) return { errorRate: 0, cycles: [], confidence: 0 };

    // Detect transmission-level errors (systematic failures, periodic issues)
    const cycles = this.detectCycles(data);
    const errorClusters = this.detectErrorClusters(data);

    // Calculate overall error rate with decay weighting (recent errors more important)
    let weightedErrorRate = 0;
    for (let i = 0; i < data.length; i++) {
      const weight = Math.exp(-(data.length - 1 - i) * 0.1); // Exponential decay
      const isError = Math.abs(data[i] - 128) > 40; // Simple error threshold
      weightedErrorRate += (isError ? 1 : 0) * weight;
    }
    weightedErrorRate /= data.reduce((sum, _, i) => sum + Math.exp(-(data.length - 1 - i) * 0.1), 0);

    return {
      errorRate: weightedErrorRate,
      cycles,
      errorClusters,
      confidence: Math.min(1.0, data.length / this.scales.macro.window)
    };
  }

  detectTrends(data) {
    const trends = [];
    const windowSize = 10;

    for (let i = windowSize; i < data.length; i += windowSize) {
      const window = data.slice(i - windowSize, i);
      const slope = this.calculateSlope(window);

      if (Math.abs(slope) > 0.5) { // Significant trend
        trends.push({
          startIndex: i - windowSize,
          endIndex: i,
          slope,
          direction: slope > 0 ? 'increasing' : 'decreasing',
          magnitude: Math.abs(slope)
        });
      }
    }

    return trends;
  }

  calculateSlope(data) {
    const n = data.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = data.reduce((sum, val, idx) => sum + val * idx, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  detectCycles(data) {
    if (data.length < 30) return [];

    const cycles = [];
    const minPeriod = 5;
    const maxPeriod = Math.min(25, data.length / 3);

    for (let period = minPeriod; period <= maxPeriod; period++) {
      const correlations = [];

      for (let lag = 1; lag <= Math.min(period * 2, data.length - period); lag++) {
        let correlation = 0;
        let count = 0;

        for (let i = lag; i < data.length - period; i++) {
          correlation += (data[i] - 128) * (data[i + period] - 128);
          count++;
        }

        correlations.push(correlation / count);
      }

      const avgCorrelation = correlations.reduce((a, b) => a + b, 0) / correlations.length;

      if (avgCorrelation > 0.3) {
        cycles.push({
          period,
          strength: avgCorrelation,
          confidence: Math.min(1.0, correlations.length / 10)
        });
      }
    }

    return cycles.sort((a, b) => b.strength - a.strength);
  }

  detectErrorClusters(data) {
    const clusters = [];
    let currentCluster = null;

    for (let i = 0; i < data.length; i++) {
      const isError = Math.abs(data[i] - 128) > 40;

      if (isError && !currentCluster) {
        // Start new cluster
        currentCluster = {
          startIndex: i,
          errors: [data[i]],
          indices: [i]
        };
      } else if (isError && currentCluster) {
        // Continue cluster
        currentCluster.errors.push(data[i]);
        currentCluster.indices.push(i);
      } else if (!isError && currentCluster) {
        // End cluster
        currentCluster.endIndex = i - 1;
        currentCluster.length = currentCluster.errors.length;
        currentCluster.severity = currentCluster.errors.reduce((sum, val) =>
          sum + Math.abs(val - 128), 0) / currentCluster.errors.length;

        if (currentCluster.length >= 3) { // Minimum cluster size
          clusters.push(currentCluster);
        }
        currentCluster = null;
      }
    }

    // Handle cluster that goes to end
    if (currentCluster && currentCluster.length >= 3) {
      currentCluster.endIndex = data.length - 1;
      currentCluster.length = currentCluster.errors.length;
      currentCluster.severity = currentCluster.errors.reduce((sum, val) =>
        sum + Math.abs(val - 128), 0) / currentCluster.errors.length;
      clusters.push(currentCluster);
    }

    return clusters;
  }

  calculateFractalDimension(data) {
    if (data.length < 20) return { dimension: 1.0, confidence: 0 };

    // Simplified fractal dimension calculation using box counting
    const scales = [2, 4, 8, 16];
    const counts = scales.map(scale => this.boxCount(data, scale));

    // Estimate dimension using log-log regression
    const logScales = scales.map(s => Math.log(1/s));
    const logCounts = counts.map(c => Math.log(c));

    const dimension = this.estimateSlope(logScales, logCounts);

    return {
      dimension: Math.max(1.0, Math.min(2.0, dimension)),
      confidence: Math.min(1.0, data.length / 100)
    };
  }

  boxCount(data, scale) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const numBoxes = Math.ceil(range / scale);

    const boxes = new Set();

    data.forEach((value, index) => {
      const boxIndex = Math.floor((value - min) / scale);
      boxes.add(`${boxIndex}_${Math.floor(index / scale)}`);
    });

    return boxes.size;
  }

  estimateSlope(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, val, idx) => sum + val * y[idx], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  detectTemporalPatterns(data) {
    // Detect common temporal error patterns
    const patterns = {
      burstErrors: this.detectBurstErrors(data),
      periodicErrors: this.detectPeriodicErrors(data),
      driftErrors: this.detectDriftErrors(data),
      noiseFloor: this.calculateNoiseFloor(data)
    };

    return patterns;
  }

  detectBurstErrors(data) {
    const bursts = [];
    let burstStart = -1;

    for (let i = 0; i < data.length; i++) {
      const isError = Math.abs(data[i] - 128) > 40;

      if (isError && burstStart === -1) {
        burstStart = i;
      } else if (!isError && burstStart !== -1) {
        const burstLength = i - burstStart;
        if (burstLength >= 3) {
          bursts.push({
            start: burstStart,
            length: burstLength,
            severity: data.slice(burstStart, i).reduce((sum, val) =>
              sum + Math.abs(val - 128), 0) / burstLength
          });
        }
        burstStart = -1;
      }
    }

    return bursts;
  }

  detectPeriodicErrors(data) {
    // Use autocorrelation to detect periodic error patterns
    const maxLag = Math.min(30, data.length / 2);
    const autocorr = [];

    for (let lag = 1; lag <= maxLag; lag++) {
      let correlation = 0;
      let count = 0;

      for (let i = lag; i < data.length; i++) {
        const error1 = Math.abs(data[i - lag] - 128) > 40 ? 1 : 0;
        const error2 = Math.abs(data[i] - 128) > 40 ? 1 : 0;
        correlation += error1 * error2;
        count++;
      }

      autocorr.push(correlation / count);
    }

    // Find peaks in autocorrelation
    const peaks = [];
    for (let i = 1; i < autocorr.length - 1; i++) {
      if (autocorr[i] > autocorr[i-1] && autocorr[i] > autocorr[i+1] && autocorr[i] > 0.3) {
        peaks.push({
          period: i + 1,
          strength: autocorr[i]
        });
      }
    }

    return peaks;
  }

  detectDriftErrors(data) {
    // Detect slow drift in signal quality
    const windowSize = 20;
    const drifts = [];

    for (let i = windowSize; i < data.length; i += windowSize) {
      const window = data.slice(i - windowSize, i);
      const startMean = window.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const endMean = window.slice(10).reduce((a, b) => a + b, 0) / 10;
      const drift = endMean - startMean;

      if (Math.abs(drift) > 15) {
        drifts.push({
          windowStart: i - windowSize,
          windowEnd: i,
          drift,
          direction: drift > 0 ? 'up' : 'down'
        });
      }
    }

    return drifts;
  }

  calculateNoiseFloor(data) {
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    // Noise floor is the lower bound of normal variation
    return Math.max(0, q1 - 1.5 * iqr);
  }

  // Apply multi-scale error correction
  applyMultiScaleCorrection(receivedBrightness, analysis, confidence) {
    if (confidence < 0.3) return receivedBrightness; // Not confident enough

    let corrected = receivedBrightness;

    // Micro-scale correction (spike removal)
    if (analysis.microScale.errorRate > this.adaptiveThresholds.micro) {
      corrected = this.applyMicroCorrection(corrected, analysis.microScale);
    }

    // Meso-scale correction (trend compensation)
    if (analysis.mesoScale.errorRate > this.adaptiveThresholds.meso) {
      corrected = this.applyMesoCorrection(corrected, analysis.mesoScale);
    }

    // Macro-scale correction (systematic error removal)
    if (analysis.macroScale.errorRate > this.adaptiveThresholds.macro) {
      corrected = this.applyMacroCorrection(corrected, analysis.macroScale);
    }

    return Math.max(0, Math.min(255, corrected));
  }

  applyMicroCorrection(value, microAnalysis) {
    // Remove spikes by median filtering
    const window = [value];
    if (this.errorHistory.length > 0) {
      const recent = this.errorHistory[this.errorHistory.length - 1].signalData;
      window.push(...recent.slice(-4)); // Add last 4 values
    }

    window.sort((a, b) => a - b);
    return window[Math.floor(window.length / 2)]; // Median
  }

  applyMesoCorrection(value, mesoAnalysis) {
    // Compensate for trends
    const recentTrends = mesoAnalysis.trends.slice(-1)[0];
    if (recentTrends) {
      // Apply inverse trend correction
      const correction = -recentTrends.slope * 0.5; // Dampened correction
      return value + correction;
    }
    return value;
  }

  applyMacroCorrection(value, macroAnalysis) {
    // Remove systematic errors based on cycles
    const dominantCycle = macroAnalysis.cycles[0];
    if (dominantCycle) {
      // Apply phase correction for periodic errors
      const phase = (Date.now() * 1000 / dominantCycle.period) % (2 * Math.PI);
      const correction = Math.sin(phase) * 10 * dominantCycle.strength; // Small correction
      return value - correction;
    }
    return value;
  }

  // Adapt thresholds based on performance
  adaptThresholds(correctionPerformance) {
    const learningRate = 0.1;

    if (correctionPerformance.improved) {
      // Lower thresholds to be more aggressive
      Object.keys(this.adaptiveThresholds).forEach(scale => {
        this.adaptiveThresholds[scale] = Math.max(0.1,
          this.adaptiveThresholds[scale] - learningRate * 0.1);
      });
    } else {
      // Raise thresholds to be more conservative
      Object.keys(this.adaptiveThresholds).forEach(scale => {
        this.adaptiveThresholds[scale] = Math.min(0.8,
          this.adaptiveThresholds[scale] + learningRate * 0.1);
      });
    }
  }
}

export default function MultiScaleTemporalErrorCorrection({
  currentBrightness,
  onCorrection,
  enableCorrection = true
}) {
  const [corrector] = useState(() => new TemporalErrorCorrector());
  const [correction, setCorrection] = useState(null);
  const [analysis, setAnalysis] = useState({});
  const [signalBuffer, setSignalBuffer] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enableCorrection) return;

    // Maintain signal buffer for analysis
    setSignalBuffer(prev => {
      const updated = [...prev, currentBrightness];
      return updated.slice(-300); // Keep last 300 samples
    });

    // Start multi-scale analysis
    intervalRef.current = setInterval(() => {
      if (signalBuffer.length >= 20) { // Minimum samples for analysis
        const multiScaleAnalysis = corrector.analyzeMultiScaleErrors(signalBuffer, Date.now());

        setAnalysis(multiScaleAnalysis);

        // Apply correction
        const correctedBrightness = corrector.applyMultiScaleCorrection(
          currentBrightness,
          multiScaleAnalysis,
          0.5 // Base confidence
        );

        const correctionData = {
          originalBrightness: currentBrightness,
          correctedBrightness,
          correction: correctedBrightness - currentBrightness,
          analysis: multiScaleAnalysis,
          confidence: 0.5,
          scales: {
            micro: multiScaleAnalysis.microScale.confidence,
            meso: multiScaleAnalysis.mesoScale.confidence,
            macro: multiScaleAnalysis.macroScale.confidence
          }
        };

        setCorrection(correctionData);

        if (onCorrection) {
          onCorrection(correctionData);
        }
      }
    }, 500); // Analyze every 500ms

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [currentBrightness, enableCorrection, signalBuffer.length]);

  const renderScaleAnalysis = () => {
    if (!analysis.microScale) return null;

    return (
      <View style={styles.scalesContainer}>
        <Text style={styles.sectionTitle}>Multi-Scale Analysis</Text>

        <View style={styles.scaleGrid}>
          <View style={styles.scaleCard}>
            <Text style={styles.scaleTitle}>Micro Scale</Text>
            <Text style={styles.scaleMetric}>
              Error Rate: {(analysis.microScale.errorRate * 100).toFixed(1)}%
            </Text>
            <Text style={styles.scaleMetric}>
              Confidence: {(analysis.microScale.confidence * 100).toFixed(0)}%
            </Text>
          </View>

          <View style={styles.scaleCard}>
            <Text style={styles.scaleTitle}>Meso Scale</Text>
            <Text style={styles.scaleMetric}>
              Error Rate: {(analysis.mesoScale.errorRate * 100).toFixed(1)}%
            </Text>
            <Text style={styles.scaleMetric}>
              Confidence: {(analysis.mesoScale.confidence * 100).toFixed(0)}%
            </Text>
          </View>

          <View style={styles.scaleCard}>
            <Text style={styles.scaleTitle}>Macro Scale</Text>
            <Text style={styles.scaleMetric}>
              Error Rate: {(analysis.macroScale.errorRate * 100).toFixed(1)}%
            </Text>
            <Text style={styles.scaleMetric}>
              Confidence: {(analysis.macroScale.confidence * 100).toFixed(0)}%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCorrectionMetrics = () => {
    if (!correction) return null;

    const correctionMagnitude = Math.abs(correction.correction);

    return (
      <View style={styles.correctionContainer}>
        <Text style={styles.sectionTitle}>Error Correction Applied</Text>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Original:</Text>
          <Text style={styles.metricValue}>{Math.round(correction.originalBrightness)}</Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Corrected:</Text>
          <Text style={styles.metricValue}>{Math.round(correction.correctedBrightness)}</Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Correction:</Text>
          <Text style={[
            styles.metricValue,
            { color: correctionMagnitude > 2 ? '#00ff64' : '#cccccc' }
          ]}>
            {correctionMagnitude > 2 ? `${Math.round(correction.correction)} units` : 'Minimal'}
          </Text>
        </View>

        {analysis.fractalAnalysis && (
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Fractal Dimension:</Text>
            <Text style={styles.metricValue}>
              {analysis.fractalAnalysis.dimension.toFixed(2)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderTemporalPatterns = () => {
    if (!analysis.temporalPatterns) return null;

    const patterns = analysis.temporalPatterns;

    return (
      <View style={styles.patternsContainer}>
        <Text style={styles.sectionTitle}>Temporal Patterns Detected</Text>

        <View style={styles.patternGrid}>
          <View style={styles.patternItem}>
            <Text style={styles.patternLabel}>Burst Errors:</Text>
            <Text style={styles.patternValue}>
              {patterns.burstErrors.length} detected
            </Text>
          </View>

          <View style={styles.patternItem}>
            <Text style={styles.patternLabel}>Periodic Errors:</Text>
            <Text style={styles.patternValue}>
              {patterns.periodicErrors.length} patterns
            </Text>
          </View>

          <View style={styles.patternItem}>
            <Text style={styles.patternLabel}>Drift Errors:</Text>
            <Text style={styles.patternValue}>
              {patterns.driftErrors.length} detected
            </Text>
          </View>

          <View style={styles.patternItem}>
            <Text style={styles.patternLabel}>Noise Floor:</Text>
            <Text style={styles.patternValue}>
              {Math.round(patterns.noiseFloor)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Multi-Scale Temporal Error Correction</Text>

      {renderCorrectionMetrics()}
      {renderScaleAnalysis()}
      {renderTemporalPatterns()}

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {correction ? 'Active' : 'Analyzing'}
        </Text>
        <Text style={styles.algorithmText}>
          Wavelet Transform + Fractal Analysis
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(50, 20, 80, 0.9)',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    borderWidth: 2,
    borderColor: '#8a2be2',
    shadowColor: '#8a2be2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 15,
    textShadowColor: '#8a2be2',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  correctionContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  scalesContainer: {
    marginBottom: 15,
  },
  patternsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  scaleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleCard: {
    flex: 1,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  scaleTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  scaleMetric: {
    color: '#cccccc',
    fontSize: 10,
    marginBottom: 2,
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
    color: '#8a2be2',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  patternItem: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  patternLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  patternValue: {
    color: '#8a2be2',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  statusText: {
    color: '#8a2be2',
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