import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';

export default function PacketInspectorModal({ visible, packet, onClose }) {
  if (!packet) return null;

  const formatBinary = (binaryStr, groupSize = 8) => {
    const groups = [];
    for (let i = 0; i < binaryStr.length; i += groupSize) {
      groups.push(binaryStr.slice(i, i + groupSize));
    }
    return groups.join(' ');
  };

  const formatHex = (binaryStr) => {
    const hex = [];
    for (let i = 0; i < binaryStr.length; i += 8) {
      const byte = binaryStr.slice(i, i + 8);
      if (byte.length === 8) {
        hex.push(parseInt(byte, 2).toString(16).padStart(2, '0').toUpperCase());
      }
    }
    return hex.join(' ');
  };

  const renderPacketStructure = () => {
    const parts = [
      { label: 'Start Frame', value: packet.rawBits?.slice(0, 8), color: '#00ff64' },
      { label: 'Type', value: packet.rawBits?.slice(8, 16), color: '#0096ff' },
      { label: 'Length', value: packet.rawBits?.slice(16, 32), color: '#ffa500' },
      { label: 'Payload', value: packet.payloadBits, color: '#ffffff' },
      { label: 'Checksum', value: packet.rawBits?.slice(-16), color: '#ff0032' },
      { label: 'End Frame', value: packet.rawBits?.slice(-8), color: '#9c27b0' },
    ];

    return parts.map((part, index) => (
      <View key={index} style={styles.partContainer}>
        <Text style={[styles.partLabel, { color: part.color }]}>{part.label}:</Text>
        <Text style={styles.binaryText}>{formatBinary(part.value || '')}</Text>
        <Text style={styles.hexText}>{formatHex(part.value || '')}</Text>
      </View>
    ));
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Packet Inspector</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Packet Information</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type:</Text>
                <Text style={styles.infoValue}>{packet.type || 'Unknown'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Valid:</Text>
                <Text style={[styles.infoValue, { color: packet.valid ? '#00ff64' : '#ff0032' }]}>
                  {packet.valid ? 'Yes' : 'No'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Size:</Text>
                <Text style={styles.infoValue}>{packet.rawBits?.length || 0} bits</Text>
              </View>
              {packet.error && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Error:</Text>
                  <Text style={[styles.infoValue, { color: '#ff0032' }]}>{packet.error}</Text>
                </View>
              )}
            </View>

            <View style={styles.structureSection}>
              <Text style={styles.sectionTitle}>Packet Structure</Text>
              {renderPacketStructure()}
            </View>

            {packet.payload && (
              <View style={styles.payloadSection}>
                <Text style={styles.sectionTitle}>Payload Data</Text>
                <Text style={styles.payloadText}>
                  {typeof packet.payload === 'string'
                    ? packet.payload
                    : JSON.stringify(packet.payload, null, 2)
                  }
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeIcon: {
    color: '#cccccc',
    fontSize: 24,
  },
  content: {
    padding: 16,
  },
  infoSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#cccccc',
    fontSize: 14,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  structureSection: {
    marginBottom: 20,
  },
  partContainer: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: 'rgba(30, 30, 40, 0.5)',
    borderRadius: 6,
  },
  partLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  binaryText: {
    color: '#00ff64',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  hexText: {
    color: '#ffa500',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  payloadSection: {
    marginBottom: 20,
  },
  payloadText: {
    color: '#cccccc',
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(30, 30, 40, 0.5)',
    padding: 8,
    borderRadius: 6,
    lineHeight: 16,
  },
});