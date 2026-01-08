import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import TransmitterScreen from './screens/TransmitterScreen.js';
import ReceiverScreen from './screens/ReceiverScreen.js';
import DashboardScreen from './screens/DashboardScreen.js';

export default function App() {
  const [activeScreen, setActiveScreen] = useState('dashboard'); // 'transmitter', 'receiver', or 'dashboard'

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
      </View>

      <View style={styles.screenContainer}>
        {activeScreen === 'transmitter' && <TransmitterScreen />}
        {activeScreen === 'receiver' && <ReceiverScreen />}
        {activeScreen === 'dashboard' && <DashboardScreen />}
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