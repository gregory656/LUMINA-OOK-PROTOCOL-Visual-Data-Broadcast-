// Transmission Quality Metrics Calculation

// Calculate Bit Error Rate from parity check failures
export function calculateBitErrorRate(receivedBytes, totalBits) {
  if (totalBits === 0) return 0;
  const parityErrors = receivedBytes.filter(byte => !validateParityBit(byte)).length;
  // Each parity error indicates at least 1 bit error in 9 bits
  return (parityErrors * 9) / totalBits;
}

// Validate single byte parity (9-bit: 8 data + 1 parity)
function validateParityBit(byteStr) {
  if (byteStr.length !== 9) return false;
  let count = 0;
  for (let i = 0; i < byteStr.length; i++) {
    if (byteStr[i] === '1') count++;
  }
  return count % 2 === 0;
}

// Calculate Signal-to-Noise Ratio from brightness samples
export function calculateSNR(samples) {
  if (samples.length < 2) return 0;

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  // SNR = signal power / noise power
  // Using (max-min)/stdDev as proxy for signal strength
  const signalStrength = Math.max(...samples) - Math.min(...samples);
  return signalStrength / (stdDev + 1); // +1 to avoid division by zero
}

// Calculate packet integrity confidence based on checksum validation
export function calculatePacketConfidence(validPackets, totalPackets) {
  if (totalPackets === 0) return 100;
  return (validPackets / totalPackets) * 100;
}

// Aggregate metrics over time window
export function aggregateMetrics(metricsHistory, timeWindowMs = 3600000) { // 1 hour default
  const now = Date.now();
  const recentMetrics = metricsHistory.filter(m => now - m.timestamp < timeWindowMs);

  if (recentMetrics.length === 0) return null;

  return {
    averageBER: recentMetrics.reduce((sum, m) => sum + m.ber, 0) / recentMetrics.length,
    averageSNR: recentMetrics.reduce((sum, m) => sum + m.snr, 0) / recentMetrics.length,
    averageConfidence: recentMetrics.reduce((sum, m) => sum + m.confidence, 0) / recentMetrics.length,
    totalTransmissions: recentMetrics.length,
    timeWindow: timeWindowMs
  };
}