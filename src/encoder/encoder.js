import { calculateParityBit } from '../utils/parity.js';
import { createPacket, PACKET_CONSTANTS, DATA_TYPES, chunkData } from '../utils/packet.js';

// Legacy support for old message format (backward compatibility)
export function encodeMessage(message) {
  const bytes = [];
  for (let i = 0; i < message.length; i++) {
    const charCode = message.charCodeAt(i);
    const binary = charCode.toString(2).padStart(8, '0');
    const parity = calculateParityBit(binary);
    bytes.push(binary + parity);
  }
  return bytes;
}

// Legacy framing for backward compatibility
export function addFraming(encodedBytes) {
  return [PACKET_CONSTANTS.START_FRAME, ...encodedBytes, PACKET_CONSTANTS.END_FRAME];
}

// New universal data encoding functions

// Encode data of any type
export function encodeData(data, dataType = DATA_TYPES.TEXT) {
  // Handle different data types
  let payload;
  switch (dataType) {
    case DATA_TYPES.TEXT:
      payload = typeof data === 'string' ? data : String(data);
      break;
    case DATA_TYPES.JSON:
      payload = JSON.stringify(data);
      break;
    case DATA_TYPES.FILE:
    case DATA_TYPES.IMAGE:
      // Assume data is already Base64 encoded
      payload = data;
      break;
    case DATA_TYPES.SENSOR_DATA:
      // Convert sensor object to JSON
      payload = JSON.stringify(data);
      break;
    default:
      payload = String(data);
  }

  // Check if chunking is needed
  if (payload.length > PACKET_CONSTANTS.MAX_CHUNK_SIZE) {
    return encodeChunkedData(payload, dataType);
  } else {
    return encodeSinglePacket(payload, dataType);
  }
}

// Encode single packet
export function encodeSinglePacket(payload, dataType) {
  const packet = createPacket(dataType, payload);
  return packet;
}

// Encode chunked data
export function encodeChunkedData(payload, dataType) {
  const chunks = chunkData(payload, dataType);
  const packets = [];

  chunks.forEach(chunk => {
    // Add chunk metadata to payload
    const chunkPayload = JSON.stringify({
      sequence: chunk.sequence,
      total: chunk.total,
      data: chunk.data
    });
    const packet = createPacket(dataType, chunkPayload);
    packets.push(...packet);
  });

  return packets;
}

// VLC Protocol Constants (legacy support)
const BIT_DURATION = 100; // 100ms per bit

// Get next bit to transmit at current time
export function getBitToTransmit(framedBits, currentIndex) {
  if (currentIndex >= framedBits.length) return null;

  const bitString = framedBits[currentIndex];
  const bitIndex = Math.floor((Date.now() % (bitString.length * BIT_DURATION)) / BIT_DURATION);
  return bitString[bitIndex];
}

// Get transmission duration for a message
export function getTransmissionDuration(message) {
  const encoded = encodeMessage(message);
  const framed = addFraming(encoded);
  const totalBits = framed.reduce((sum, byte) => sum + byte.length, 0);
  return totalBits * BIT_DURATION;
}

// Get transmission duration for data packets
export function getDataTransmissionDuration(data, dataType = DATA_TYPES.TEXT) {
  const encoded = encodeData(data, dataType);
  const totalBits = encoded.reduce((sum, bitString) => sum + bitString.length, 0);
  return totalBits * PACKET_CONSTANTS.BIT_DURATION;
}
