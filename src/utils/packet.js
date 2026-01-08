// Universal VLC Data Packet Format:
// START | TYPE | LENGTH | PAYLOAD | CHECKSUM | END
//
// START: 8 bits (11111111)
// TYPE: 8 bits (data type identifier)
// LENGTH: 16 bits (payload length in bytes)
// PAYLOAD: variable length (data)
// CHECKSUM: 16 bits (CRC-16)
// END: 8 bits (00000000)

export const PACKET_CONSTANTS = {
  START_FRAME: '11111111',
  END_FRAME: '00000000',
  BIT_DURATION: 100, // 100ms per bit
  MAX_CHUNK_SIZE: 256, // Max payload size per packet (bytes)
  CRC_POLYNOMIAL: 0x1021, // CRC-16-CCITT
};

// Data Type Identifiers
export const DATA_TYPES = {
  TEXT: '00000001',      // Plain text (backward compatible)
  JSON: '00000010',      // JSON object
  FILE: '00000011',      // File data (Base64 chunked)
  SENSOR_DATA: '00000100', // Sensor readings
  IMAGE: '00000101',     // Low-res image (Base64)
  AUDIO: '00000110',     // Real-time audio streaming
  GESTURE: '00000111',   // Gesture control data
  MESH_COMMAND: '00001000', // Multi-device mesh commands
  QUANTUM_KEY: '00001001',  // Quantum-resistant encryption keys
};

// Calculate CRC-16-CCITT
export function calculateCRC16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ PACKET_CONSTANTS.CRC_POLYNOMIAL;
      } else {
        crc <<= 1;
      }
    }
  }
  return crc & 0xFFFF;
}

// Convert number to binary string with specified bits
export function toBinaryString(value, bits) {
  return value.toString(2).padStart(bits, '0');
}

// Convert binary string to number
export function fromBinaryString(binaryStr) {
  return parseInt(binaryStr, 2);
}

// Create packet binary representation
export function createPacket(type, payload) {
  const typeBits = type;
  const lengthBits = toBinaryString(payload.length, 16);
  const payloadBits = payload.split('').map(char =>
    toBinaryString(char.charCodeAt(0), 8)
  ).join('');
  const checksumBits = toBinaryString(calculateCRC16(payload), 16);

  return [
    PACKET_CONSTANTS.START_FRAME,
    typeBits,
    lengthBits,
    payloadBits,
    checksumBits,
    PACKET_CONSTANTS.END_FRAME
  ];
}

// Parse packet from received bits
export function parsePacket(receivedBits) {
  try {
    let bitIndex = 0;

    // Find start frame
    while (bitIndex <= receivedBits.length - 8) {
      const frame = receivedBits.slice(bitIndex, bitIndex + 8).join('');
      if (frame === PACKET_CONSTANTS.START_FRAME) {
        break;
      }
      bitIndex++;
    }

    if (bitIndex > receivedBits.length - 8) {
      throw new Error('Start frame not found');
    }

    bitIndex += 8; // Skip start frame

    // Read type (8 bits)
    const typeBits = receivedBits.slice(bitIndex, bitIndex + 8).join('');
    bitIndex += 8;

    // Read length (16 bits)
    const lengthBits = receivedBits.slice(bitIndex, bitIndex + 16).join('');
    const payloadLength = fromBinaryString(lengthBits);
    bitIndex += 16;

    // Read payload
    const payloadBits = receivedBits.slice(bitIndex, bitIndex + (payloadLength * 8));
    bitIndex += payloadLength * 8;

    // Convert payload bits to string
    const payload = [];
    for (let i = 0; i < payloadBits.length; i += 8) {
      const byte = payloadBits.slice(i, i + 8).join('');
      payload.push(String.fromCharCode(fromBinaryString(byte)));
    }
    const payloadStr = payload.join('');

    // Read checksum (16 bits)
    const checksumBits = receivedBits.slice(bitIndex, bitIndex + 16).join('');
    const receivedChecksum = fromBinaryString(checksumBits);
    bitIndex += 16;

    // Verify end frame
    const endFrameBits = receivedBits.slice(bitIndex, bitIndex + 8).join('');
    if (endFrameBits !== PACKET_CONSTANTS.END_FRAME) {
      throw new Error('Invalid end frame');
    }

    // Verify checksum
    const calculatedChecksum = calculateCRC16(payloadStr);
    if (calculatedChecksum !== receivedChecksum) {
      throw new Error('Checksum mismatch');
    }

    return {
      type: typeBits,
      payload: payloadStr,
      valid: true
    };

  } catch (error) {
    return {
      type: null,
      payload: null,
      valid: false,
      error: error.message
    };
  }
}

// Get data type name from binary identifier
export function getDataTypeName(typeBits) {
  const types = Object.entries(DATA_TYPES);
  for (const [name, bits] of types) {
    if (bits === typeBits) return name;
  }
  return 'UNKNOWN';
}

// Chunk large data into multiple packets
export function chunkData(data, type, maxChunkSize = PACKET_CONSTANTS.MAX_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < data.length; i += maxChunkSize) {
    const chunk = data.slice(i, i + maxChunkSize);
    chunks.push({
      sequence: Math.floor(i / maxChunkSize),
      total: Math.ceil(data.length / maxChunkSize),
      data: chunk,
      type: type
    });
  }
  return chunks;
}

// Reassemble chunked data
export function reassembleChunks(chunks) {
  // Sort by sequence number
  chunks.sort((a, b) => a.sequence - b.sequence);

  // Check if we have all chunks
  const total = chunks[0]?.total || 0;
  if (chunks.length !== total) {
    return null; // Not all chunks received yet
  }

  // Verify sequence numbers
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].sequence !== i) {
      return null; // Missing or out of order
    }
  }

  return chunks.map(chunk => chunk.data).join('');
}