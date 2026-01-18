import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import TransmitterScreen from './screens/TransmitterScreen.js';
import ReceiverScreen from './screens/ReceiverScreen.js';
import DashboardScreen from './screens/DashboardScreen.js';
import BackendManagerScreen from './screens/BackendManagerScreen.js';
import DeviceManager from './utils/device.js';

export default function App() {
  const [activeScreen, setActiveScreen] = useState('backend'); // 'transmitter', 'receiver', 'dashboard', or 'backend'
  const [deviceId, setDeviceId] = useState(null);
  const [deviceRegistered, setDeviceRegistered] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize device identity on app start
  useEffect(() => {
    const initializeDevice = async () => {
      try {
        setIsInitializing(true);

        // Get or generate device ID (should be fast after first generation)
        const id = await DeviceManager.getDeviceId();
        setDeviceId(id);

        // Register device in Firestore (async, but device ID is already available)
        DeviceManager.registerDevice().then(registered => {
          setDeviceRegistered(registered);
          console.log('Device initialized:', id, registered ? '(registered)' : '(registration failed)');
        }).catch(error => {
          console.error('Device registration failed:', error);
          setDeviceRegistered(false);
        });

        setIsInitializing(false);
      } catch (error) {
        console.error('Failed to initialize device:', error);
        setIsInitializing(false);
        // Generate a fallback ID for immediate use
        const fallbackId = `fallback-${Date.now()}`;
        setDeviceId(fallbackId);
      }
    };

    initializeDevice();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeScreen === 'transmitter' && styles.activeTab]}
          onPress={() => setActiveScreen('transmitter')}
        >
          <Text style={[styles.tabText, activeScreen === 'transmitter' && styles.activeTabText]}>
            Transmit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeScreen === 'receiver' && styles.activeTab]}
          onPress={() => setActiveScreen('receiver')}
        >
          <Text style={[styles.tabText, activeScreen === 'receiver' && styles.activeTabText]}>
            Receive
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeScreen === 'dashboard' && styles.activeTab]}
          onPress={() => setActiveScreen('dashboard')}
        >
          <Text style={[styles.tabText, activeScreen === 'dashboard' && styles.activeTabText]}>
            Dashboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeScreen === 'backend' && styles.activeTab]}
          onPress={() => setActiveScreen('backend')}
        >
          <Text style={[styles.tabText, activeScreen === 'backend' && styles.activeTabText]}>
            Backend
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.screenContainer}>
        {activeScreen === 'transmitter' && <TransmitterScreen />}
        {activeScreen === 'receiver' && <ReceiverScreen />}
        {activeScreen === 'dashboard' && <DashboardScreen />}
        {activeScreen === 'backend' && <BackendManagerScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#333',
    paddingTop: 50, // Account for status bar
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#333',
  },
  activeTab: {
    backgroundColor: '#555',
  },
  tabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: '#fff',
  },
  screenContainer: {
    flex: 1,
  },
});