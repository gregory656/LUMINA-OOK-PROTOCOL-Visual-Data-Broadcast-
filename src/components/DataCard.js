import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const DATA_TYPE_COLORS = {
  TEXT: '#00ff64',
  JSON: '#0096ff',
  FILE: '#ffa500',
  IMAGE: '#ff0032',
  SENSOR_DATA: '#9c27b0',
  UNKNOWN: '#666666'
};

export default function DataCard({ data, onPress, expandable = false, expanded = false }) {
  const getDataTypeColor = (type) => {
    return DATA_TYPE_COLORS[type] || DATA_TYPE_COLORS.UNKNOWN;
  };

  const formatDataPreview = (data, type) => {
    if (type === 'JSON') {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return JSON.stringify(parsed, null, 2).substring(0, 100) + '...';
      } catch (e) {
        return String(data).substring(0, 100) + '...';
      }
    } else if (type === 'TEXT') {
      return String(data).substring(0, 100) + (String(data).length > 100 ? '...' : '');
    } else if (type === 'FILE' || type === 'IMAGE') {
      return `[Base64 data: ${String(data).length} chars]`;
    } else {
      return String(data).substring(0, 100) + '...';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatSize = (size) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const color = getDataTypeColor(data.type);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.typeContainer}>
          <View style={[styles.typeIndicator, { backgroundColor: color }]} />
          <Text style={styles.typeText}>{data.type}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(data.timestamp)}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sizeText}>Size: {formatSize(data.size)}</Text>
        <Text style={styles.durationText}>Duration: {data.duration}ms</Text>
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          <Text style={styles.dataLabel}>Data:</Text>
          <Text style={styles.dataPreview}>{formatDataPreview(data.data, data.type)}</Text>
        </View>
      )}

      {expandable && !expanded && (
        <Text style={styles.expandHint}>Tap to expand</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(30, 30, 40, 0.9)',
    borderLeftWidth: 4,
    borderRadius: 8,
    marginVertical: 4,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  typeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timestamp: {
    color: '#cccccc',
    fontSize: 12,
  },
  content: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sizeText: {
    color: '#ffffff',
    fontSize: 12,
  },
  durationText: {
    color: '#cccccc',
    fontSize: 12,
  },
  expandedContent: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  dataLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  dataPreview: {
    color: '#cccccc',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  expandHint: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    padding: 8,
  },
});