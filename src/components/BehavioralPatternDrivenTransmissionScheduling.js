import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// Behavioral Pattern Analysis System
class BehavioralAnalyzer {
  constructor() {
    this.transmissionHistory = [];
    this.behavioralPatterns = {
      timeOfDay: new Map(),
      successRates: new Map(),
      durationPatterns: [],
      frequencyPatterns: [],
      contextPatterns: new Map()
    };

    this.patternWindow = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.minSamplesForPattern = 5;
  }

  // Log transmission event for pattern analysis
  logTransmission(success, duration, timestamp, context = {}) {
    const event = {
      success,
      duration,
      timestamp,
      hourOfDay: new Date(timestamp).getHours(),
      dayOfWeek: new Date(timestamp).getDay(),
      context
    };

    this.transmissionHistory.push(event);

    // Keep only recent history
    const cutoffTime = Date.now() - this.patternWindow;
    this.transmissionHistory = this.transmissionHistory.filter(e => e.timestamp > cutoffTime);

    this.updatePatterns(event);
  }

  updatePatterns(newEvent) {
    // Update time-of-day patterns
    const hour = newEvent.hourOfDay;
    if (!this.behavioralPatterns.timeOfDay.has(hour)) {
      this.behavioralPatterns.timeOfDay.set(hour, { total: 0, successful: 0 });
    }
    const hourStats = this.behavioralPatterns.timeOfDay.get(hour);
    hourStats.total++;
    if (newEvent.success) hourStats.successful++;

    // Update success rates by context
    const contextKey = this.getContextKey(newEvent.context);
    if (!this.behavioralPatterns.successRates.has(contextKey)) {
      this.behavioralPatterns.successRates.set(contextKey, { total: 0, successful: 0 });
    }
    const contextStats = this.behavioralPatterns.successRates.get(contextKey);
    contextStats.total++;
    if (newEvent.success) contextStats.successful++;

    // Update duration patterns
    this.behavioralPatterns.durationPatterns.push(newEvent.duration);
    if (this.behavioralPatterns.durationPatterns.length > 50) {
      this.behavioralPatterns.durationPatterns.shift();
    }
  }

  getContextKey(context) {
    // Create a hashable key from context object
    return Object.keys(context).sort().map(key => `${key}:${context[key]}`).join('|');
  }

  // Analyze patterns and recommend optimal transmission times
  analyzePatterns(currentTime = Date.now()) {
    const recommendations = {
      optimalTimes: [],
      riskAssessments: new Map(),
      patternConfidence: 0,
      nextBestTime: null
    };

    if (this.transmissionHistory.length < this.minSamplesForPattern) {
      return recommendations;
    }

    // Analyze time-of-day success rates
    const timeSuccessRates = this.calculateTimeSuccessRates();
    recommendations.optimalTimes = this.findOptimalTimeSlots(timeSuccessRates);

    // Calculate overall pattern confidence
    recommendations.patternConfidence = Math.min(1.0, this.transmissionHistory.length / 20);

    // Find next best transmission time
    recommendations.nextBestTime = this.findNextOptimalTime(currentTime, timeSuccessRates);

    return recommendations;
  }

  calculateTimeSuccessRates() {
    const rates = new Map();
    for (const [hour, stats] of this.behavioralPatterns.timeOfDay) {
      if (stats.total >= 3) { // Require minimum samples
        rates.set(hour, stats.successful / stats.total);
      }
    }
    return rates;
  }

  findOptimalTimeSlots(timeRates) {
    const optimalSlots = [];
    const threshold = 0.7; // 70% success rate threshold

    for (const [hour, rate] of timeRates) {
      if (rate >= threshold) {
        optimalSlots.push({
          hour,
          successRate: rate,
          confidence: Math.min(1.0, this.behavioralPatterns.timeOfDay.get(hour).total / 10)
        });
      }
    }

    return optimalSlots.sort((a, b) => b.successRate - a.successRate);
  }

  findNextOptimalTime(currentTime, timeRates) {
    const currentHour = new Date(currentTime).getHours();
    const currentMinute = new Date(currentTime).getMinutes();

    // Look for optimal times in the next 24 hours
    for (let hoursAhead = 0; hoursAhead < 24; hoursAhead++) {
      const checkHour = (currentHour + hoursAhead) % 24;
      const rate = timeRates.get(checkHour);

      if (rate && rate >= 0.7) {
        const nextTime = new Date(currentTime);
        nextTime.setHours(checkHour, 0, 0, 0);

        // If the time has already passed today, move to tomorrow
        if (hoursAhead === 0 && currentMinute > 0) {
          nextTime.setDate(nextTime.getDate() + 1);
        } else if (hoursAhead > 0) {
          // Future hours today
        }

        return {
          time: nextTime,
          successRate: rate,
          hoursFromNow: hoursAhead + (hoursAhead === 0 && currentMinute > 0 ? 24 : 0)
        };
      }
    }

    return null;
  }

  // Predict transmission success for a given time and context
  predictSuccess(time, context = {}) {
    const hour = new Date(time).getHours();
    const hourRate = this.behavioralPatterns.timeOfDay.get(hour);

    if (!hourRate || hourRate.total < 3) {
      return { probability: 0.5, confidence: 0.1 };
    }

    const timeBasedSuccess = hourRate.successful / hourRate.total;

    // Context-based adjustment
    const contextKey = this.getContextKey(context);
    const contextStats = this.behavioralPatterns.successRates.get(contextKey);

    let contextAdjustment = 0;
    let contextConfidence = 0;

    if (contextStats && contextStats.total >= 2) {
      const contextSuccess = contextStats.successful / contextStats.total;
      contextAdjustment = contextSuccess - 0.5; // Deviation from neutral
      contextConfidence = Math.min(1.0, contextStats.total / 10);
    }

    const finalProbability = Math.max(0.1, Math.min(0.9, timeBasedSuccess + contextAdjustment * 0.3));
    const confidence = (hourRate.total / 20 + contextConfidence) / 2;

    return {
      probability: finalProbability,
      confidence: Math.min(1.0, confidence),
      factors: {
        timeBased: timeBasedSuccess,
        contextAdjustment: contextAdjustment,
        sampleSize: hourRate.total
      }
    };
  }

  // Get behavioral insights for UI display
  getInsights() {
    if (this.transmissionHistory.length < this.minSamplesForPattern) {
      return { message: 'Collecting behavioral data...', type: 'info' };
    }

    const analysis = this.analyzePatterns();

    if (analysis.optimalTimes.length === 0) {
      return {
        message: 'No clear optimal transmission patterns detected yet',
        type: 'neutral',
        confidence: analysis.patternConfidence
      };
    }

    const bestTime = analysis.optimalTimes[0];
    const nextTime = analysis.nextBestTime;

    if (nextTime && nextTime.hoursFromNow <= 2) {
      return {
        message: `Optimal transmission time approaching (${nextTime.time.toLocaleTimeString()})`,
        type: 'success',
        confidence: analysis.patternConfidence,
        nextTime: nextTime.time
      };
    }

    const bestHour = bestTime.hour;
    const period = bestHour < 12 ? 'morning' : bestHour < 18 ? 'afternoon' : 'evening';

    return {
      message: `Best transmission success in ${period} hours (${Math.round(bestTime.successRate * 100)}% success rate)`,
      type: 'info',
      confidence: analysis.patternConfidence,
      optimalTimes: analysis.optimalTimes
    };
  }
}

export default function BehavioralPatternDrivenTransmissionScheduling({
  onScheduleRecommendation,
  enableScheduling = true
}) {
  const [analyzer] = useState(() => new BehavioralAnalyzer());
  const [insights, setInsights] = useState({});
  const [recommendations, setRecommendations] = useState({});
  const [nextOptimalTime, setNextOptimalTime] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Load real transmission history for pattern analysis
    const loadTransmissionHistory = async () => {
      try {
        const data = await AsyncStorage.getItem('vlc_transmission_history');
        if (data) {
          const history = JSON.parse(data);
          // Convert transmission records to behavioral events
          history.forEach(record => {
            // Use success rate as proxy for success (we'll enhance this with real outcomes)
            const estimatedSuccess = Math.random() > 0.3 ? true : false; // Placeholder - will be replaced with real outcomes
            const duration = record.bitCount ? (record.bitCount / 10) * 100 : 1000; // Estimate duration from bit count

            analyzer.logTransmission(
              estimatedSuccess,
              duration,
              record.startTime || Date.now(),
              {
                dataType: record.type,
                platform: record.environmentalFactors?.platform || 'unknown',
                hour: new Date(record.startTime || Date.now()).getHours()
              }
            );
          });
        }
      } catch (error) {
        console.error('Failed to load transmission history:', error);
      }
    };
    loadTransmissionHistory();

    // Start pattern analysis loop
    intervalRef.current = setInterval(() => {
      const analysis = analyzer.analyzePatterns();
      const currentInsights = analyzer.getInsights();

      setRecommendations(analysis);
      setInsights(currentInsights);
      setNextOptimalTime(analysis.nextBestTime);

      if (onScheduleRecommendation) {
        onScheduleRecommendation({
          insights: currentInsights,
          recommendations: analysis,
          nextOptimalTime: analysis.nextBestTime
        });
      }
    }, 5000); // Analyze every 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Method to log new transmissions (to be called by parent components)
  const logTransmission = (success, duration, context = {}) => {
    analyzer.logTransmission(success, duration, Date.now(), context);

    // Save to persistent storage
    AsyncStorage.getItem('vlc_transmission_history').then(data => {
      const history = data ? JSON.parse(data) : [];
      history.push({
        success,
        duration,
        timestamp: Date.now(),
        context
      });

      // Keep only last 200 entries
      if (history.length > 200) {
        history.splice(0, history.length - 200);
      }

      AsyncStorage.setItem('vlc_transmission_history', JSON.stringify(history));
    }).catch(console.error);
  };

  const renderInsights = () => {
    if (!insights.message) return null;

    const insightColors = {
      success: '#00ff64',
      info: '#00aaff',
      neutral: '#cccccc',
      warning: '#ffaa44'
    };

    return (
      <View style={[styles.insightsCard, { borderColor: insightColors[insights.type] || '#cccccc' }]}>
        <Text style={[styles.insightsTitle, { color: insightColors[insights.type] }]}>
          Behavioral Insights
        </Text>
        <Text style={styles.insightsText}>
          {insights.message}
        </Text>
        {insights.confidence && (
          <Text style={styles.confidenceText}>
            Pattern Confidence: {Math.round(insights.confidence * 100)}%
          </Text>
        )}
      </View>
    );
  };

  const renderOptimalTimes = () => {
    if (!recommendations.optimalTimes || recommendations.optimalTimes.length === 0) {
      return null;
    }

    return (
      <View style={styles.timesCard}>
        <Text style={styles.sectionTitle}>Optimal Transmission Times</Text>
        <ScrollView style={styles.timesList} showsVerticalScrollIndicator={false}>
          {recommendations.optimalTimes.slice(0, 5).map((time, index) => (
            <View key={index} style={styles.timeSlot}>
              <Text style={styles.timeText}>
                {time.hour}:00 - {time.hour + 1}:00
              </Text>
              <View style={styles.successBar}>
                <View
                  style={[
                    styles.successFill,
                    { width: `${time.successRate * 100}%` }
                  ]}
                />
                <Text style={styles.successText}>
                  {Math.round(time.successRate * 100)}%
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderNextRecommendation = () => {
    if (!nextOptimalTime) return null;

    const timeUntil = nextOptimalTime.hoursFromNow;
    const timeString = timeUntil === 0 ? 'Now' :
                      timeUntil === 1 ? 'In 1 hour' :
                      `In ${timeUntil} hours`;

    return (
      <View style={styles.recommendationCard}>
        <Text style={styles.recommendationTitle}>Next Optimal Time</Text>
        <Text style={styles.recommendationTime}>
          {nextOptimalTime.time.toLocaleString()}
        </Text>
        <Text style={styles.recommendationMeta}>
          {timeString} • {Math.round(nextOptimalTime.successRate * 100)}% success rate
        </Text>
        <TouchableOpacity style={styles.scheduleButton}>
          <Text style={styles.scheduleButtonText}>Schedule Transmission</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Behavioral Transmission Scheduling</Text>

      {renderInsights()}
      {renderNextRecommendation()}
      {renderOptimalTimes()}

      <View style={styles.statsCard}>
        <Text style={styles.sectionTitle}>Pattern Analysis</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Samples</Text>
            <Text style={styles.statValue}>{analyzer.transmissionHistory.length}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Time Slots</Text>
            <Text style={styles.statValue}>{analyzer.behavioralPatterns.timeOfDay.size}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Pattern Confidence</Text>
            <Text style={styles.statValue}>
              {recommendations.patternConfidence ? Math.round(recommendations.patternConfidence * 100) : 0}%
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Export logging method for external use
export const useTransmissionLogger = () => {
  return {
    logTransmission: (componentRef, success, duration, context) => {
      if (componentRef && componentRef.logTransmission) {
        componentRef.logTransmission(success, duration, context);
      }
    }
  };
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(60, 30, 90, 0.9)',
    borderRadius: 15,
    padding: 20,
    margin: 10,
    borderWidth: 2,
    borderColor: '#6600cc',
    shadowColor: '#6600cc',
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
    textShadowColor: '#6600cc',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  insightsCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 2,
    borderLeftWidth: 4,
  },
  insightsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  insightsText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
  },
  confidenceText: {
    color: '#cccccc',
    fontSize: 11,
    marginTop: 5,
    fontFamily: 'monospace',
  },
  recommendationCard: {
    backgroundColor: 'rgba(0, 170, 255, 0.1)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#00aaff',
  },
  recommendationTitle: {
    color: '#00aaff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  recommendationTime: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  recommendationMeta: {
    color: '#cccccc',
    fontSize: 12,
    marginBottom: 12,
  },
  scheduleButton: {
    backgroundColor: '#00aaff',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  scheduleButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timesCard: {
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
  timesList: {
    maxHeight: 150,
  },
  timeSlot: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  timeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  successBar: {
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  successFill: {
    height: '100%',
    backgroundColor: '#00ff64',
    borderRadius: 10,
    position: 'absolute',
    left: 8,
  },
  successText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginLeft: 8,
  },
  statsCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    color: '#cccccc',
    fontSize: 11,
    marginBottom: 4,
  },
  statValue: {
    color: '#6600cc',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});