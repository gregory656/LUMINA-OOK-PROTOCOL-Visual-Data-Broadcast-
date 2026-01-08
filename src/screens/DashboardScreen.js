import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DataCard from '../components/DataCard';
import SignalIndicator from '../components/SignalIndicator';
import TransmissionProgressBar from '../components/TransmissionProgressBar';
import PacketInspectorModal from '../components/PacketInspectorModal';
import VLCAlert from '../components/VLCAlert';

const { width, height } = Dimensions.get('window');

export default function DashboardScreen() {
  const [dataHistory, setDataHistory] = useState([]);
  const [transmissionStats, setTransmissionStats] = useState({
    totalTransmissions: 0,
    successfulTransmissions: 0,
    failedTransmissions: 0,
    averageBitrate: 0,
    totalDataSize: 0
  });
  const [signalStatus, setSignalStatus] = useState({
    isActive: false,
    bitValue: 0,
    syncStatus: 'waiting'
  });
  const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [packetModalVisible, setPacketModalVisible] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);

  // Simulated data for demo
  const intervalRef = useRef(null);

  useEffect(() => {
    loadDataHistory();
    startSignalSimulation();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const loadDataHistory = async () => {
    try {
      const data = await AsyncStorage.getItem('vlc_data');
      if (data) {
        const history = JSON.parse(data);
        setDataHistory(history);

        // Calculate stats
        const stats = {
          totalTransmissions: history.length,
          successfulTransmissions: history.filter(item => item.type !== 'UNKNOWN').length,
          failedTransmissions: history.filter(item => item.type === 'UNKNOWN').length,
          totalDataSize: history.reduce((sum, item) => sum + item.size, 0),
          averageBitrate: history.length > 0
            ? history.reduce((sum, item) => sum + (item.size * 8 / (item.duration / 1000)), 0) / history.length
            : 0
        };
        setTransmissionStats(stats);
      }
    } catch (error) {
      console.error('Failed to load data history:', error);
      showAlert('error', 'Data Load Error', 'Failed to load transmission history');
    }
  };

  const startSignalSimulation = () => {
    intervalRef.current = setInterval(() => {
      // Simulate signal activity
      const isActive = Math.random() > 0.7;
      const bitValue = Math.random() > 0.5 ? 1 : 0;
      const syncStatuses = ['waiting', 'syncing', 'synced', 'error'];
      const syncStatus = syncStatuses[Math.floor(Math.random() * syncStatuses.length)];

      setSignalStatus({ isActive, bitValue, syncStatus });
    }, 2000);
  };

  const showAlert = (type, title, message) => {
    setAlert({ visible: true, type, title, message });
  };

  const dismissAlert = () => {
    setAlert({ visible: false, type: 'info', title: '', message: '' });
  };

  const handleCardPress = (data, index) => {
    if (expandedCard === index) {
      setExpandedCard(null);
    } else {
      setExpandedCard(index);
    }
  };

  const handlePacketInspect = (data) => {
    // Mock packet data for inspection
    const mockPacket = {
      type: data.type,
      valid: true,
      rawBits: '11111111000000010000000000000001' + '0'.repeat(data.size * 8) + '000000000000000000000000',
      payloadBits: '0'.repeat(data.size * 8),
      payload: data.data,
      error: null
    };
    setSelectedPacket(mockPacket);
    setPacketModalVisible(true);
  };

  const filterDataByType = (type) => {
    return dataHistory.filter(item => item.type === type);
  };

  const renderTransmissionOverview = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Transmission Overview</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{transmissionStats.totalTransmissions}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#00ff64' }]}>
            {transmissionStats.successfulTransmissions}
          </Text>
          <Text style={styles.statLabel}>Success</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#ff0032' }]}>
            {transmissionStats.failedTransmissions}
          </Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {transmissionStats.averageBitrate.toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Avg BPS</Text>
        </View>
      </View>
    </View>
  );

  const renderSignalMonitor = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Live Signal Monitor</Text>
      <SignalIndicator
        isActive={signalStatus.isActive}
        bitValue={signalStatus.bitValue}
        syncStatus={signalStatus.syncStatus}
      />
      <TransmissionProgressBar
        progress={0.0} // No active transmission
        bitrate={transmissionStats.averageBitrate}
      />
    </View>
  );

  const renderDataHistory = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Received Data History</Text>
      <View style={styles.filterButtons}>
        {['ALL', 'TEXT', 'JSON', 'FILE', 'IMAGE', 'SENSOR_DATA'].map(type => (
          <TouchableOpacity
            key={type}
            style={styles.filterButton}
            onPress={() => {/* TODO: Implement filtering */}}
          >
            <Text style={styles.filterButtonText}>{type}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.dataList}>
        {dataHistory.slice(0, 10).map((data, index) => (
          <DataCard
            key={index}
            data={data}
            expandable={true}
            expanded={expandedCard === index}
            onPress={() => handleCardPress(data, index)}
          />
        ))}
        {dataHistory.length === 0 && (
          <Text style={styles.emptyText}>No data received yet</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderIntegrityStatus = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Integrity Status</Text>
      <View style={styles.integrityStats}>
        <View style={styles.integrityItem}>
          <Text style={styles.integrityLabel}>Success Rate:</Text>
          <Text style={styles.integrityValue}>
            {transmissionStats.totalTransmissions > 0
              ? Math.round((transmissionStats.successfulTransmissions / transmissionStats.totalTransmissions) * 100)
              : 0}%
          </Text>
        </View>
        <View style={styles.integrityItem}>
          <Text style={styles.integrityLabel}>Total Data:</Text>
          <Text style={styles.integrityValue}>
            {(transmissionStats.totalDataSize / 1024).toFixed(1)} KB
          </Text>
        </View>
        <View style={styles.integrityItem}>
          <Text style={styles.integrityLabel}>Error Count:</Text>
          <Text style={[styles.integrityValue, { color: '#ff0032' }]}>
            {transmissionStats.failedTransmissions}
          </Text>
        </View>
        <View style={styles.integrityItem}>
          <Text style={styles.integrityLabel}>Avg Bitrate:</Text>
          <Text style={styles.integrityValue}>
            {transmissionStats.averageBitrate.toFixed(0)} bps
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>VLC Data Dashboard</Text>

      {renderTransmissionOverview()}
      {renderSignalMonitor()}
      {renderDataHistory()}
      {renderIntegrityStatus()}

      <VLCAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onDismiss={dismissAlert}
      />

      <PacketInspectorModal
        visible={packetModalVisible}
        packet={selectedPacket}
        onClose={() => setPacketModalVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
    textShadowColor: '#00ff64',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  card: {
    backgroundColor: 'rgba(20, 20, 30, 0.9)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#00ff64',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff64',
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 12,
    color: '#cccccc',
    marginTop: 4,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  filterButton: {
    backgroundColor: 'rgba(0, 255, 100, 0.2)',
    borderWidth: 1,
    borderColor: '#00ff64',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  filterButtonText: {
    color: '#00ff64',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dataList: {
    maxHeight: 300,
  },
  emptyText: {
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  integrityStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  integrityItem: {
    width: '48%',
    marginBottom: 12,
  },
  integrityLabel: {
    color: '#cccccc',
    fontSize: 12,
  },
  integrityValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});