// Universal VLC Data Packet Format:
// START | TYPE | FLAGS | LENGTH | PAYLOAD | CHECKSUM | END
//
// START: 8 bits (11111111)
// TYPE: 8 bits (data type identifier)
// FLAGS: 8 bits (compression, chunking, etc.)
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

// Packet Flags
export const PACKET_FLAGS = {
  COMPRESSED: 1,      // Bit 0: Data is compressed
  CHUNKED: 2,         // Bit 1: Part of chunked transmission
  ENCRYPTED: 4,       // Bit 2: Data is encrypted
  HIGH_PRIORITY: 8,   // Bit 3: High priority packet
  RETRANSMISSION: 16, // Bit 4: Retransmission of failed packet
  FEC_ENABLED: 32,    // Bit 5: Forward Error Correction enabled
};

// Reed-Solomon Error Correction Implementation
export class ReedSolomonFEC {
  constructor(dataShards = 4, parityShards = 2) {
    this.dataShards = dataShards;
    this.parityShards = parityShards;
    this.totalShards = dataShards + parityShards;
    // Simplified Reed-Solomon implementation for demo
    this.generator = this.generateGeneratorPolynomial();
  }

  // Generate generator polynomial for Reed-Solomon
  generateGeneratorPolynomial() {
    // Simplified implementation - in practice would use proper GF(256) arithmetic
    return [1, 2, 4, 8, 16]; // Example coefficients
  }

  // Encode data with FEC
  encode(data) {
    const dataBytes = data.split('').map(c => c.charCodeAt(0));
    const parityBytes = new Array(this.parityShards).fill(0);

    // Simple parity calculation (simplified Reed-Solomon)
    for (let i = 0; i < dataBytes.length; i++) {
      for (let j = 0; j < this.parityShards; j++) {
        parityBytes[j] ^= dataBytes[i] ^ (j + 1); // Simple XOR with offset
      }
    }

    return {
      data: dataBytes,
      parity: parityBytes,
      originalSize: data.length
    };
  }

  // Decode data with error correction
  decode(encodedData) {
    try {
      const dataBytes = encodedData.data;
      const parityBytes = encodedData.parity;
      const corrected = [...dataBytes];

      // Simple error detection and correction
      const calculatedParity = new Array(this.parityShards).fill(0);
      for (let i = 0; i < dataBytes.length; i++) {
        for (let j = 0; j < this.parityShards; j++) {
          calculatedParity[j] ^= dataBytes[i] ^ (j + 1);
        }
      }

      // Check for errors and attempt correction
      let errorsCorrected = 0;
      for (let j = 0; j < this.parityShards; j++) {
        if (calculatedParity[j] !== parityBytes[j]) {
          // Attempt single error correction (simplified)
          const errorPos = Math.abs(calculatedParity[j] - parityBytes[j]) % dataBytes.length;
          if (errorPos < dataBytes.length) {
            corrected[errorPos] ^= (calculatedParity[j] ^ parityBytes[j]);
            errorsCorrected++;
          }
        }
      }

      return {
        data: String.fromCharCode(...corrected),
        errorsCorrected,
        success: errorsCorrected <= this.parityShards / 2 // Can correct up to t = parity/2 errors
      };
    } catch (error) {
      return {
        data: null,
        errorsCorrected: 0,
        success: false,
        error: error.message
      };
    }
  }
}

// Global FEC instance
export const fecEncoder = new ReedSolomonFEC();

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

// LZ77 Compression Implementation
export class LZ77Compressor {
  constructor(windowSize = 4096, lookaheadSize = 256) {
    this.windowSize = windowSize;
    this.lookaheadSize = lookaheadSize;
  }

  // Find longest match in window
  findLongestMatch(data, currentPos) {
    let bestMatch = { length: 0, distance: 0 };
    const start = Math.max(0, currentPos - this.windowSize);
    const end = Math.min(data.length, currentPos + this.lookaheadSize);

    for (let i = start; i < currentPos; i++) {
      let length = 0;
      while (length < end - currentPos &&
             i + length < currentPos &&
             data[i + length] === data[currentPos + length]) {
        length++;
      }

      if (length > bestMatch.length) {
        bestMatch = {
          length,
          distance: currentPos - i
        };
      }
    }

    return bestMatch;
  }

  // Compress data using LZ77
  compress(data) {
    const compressed = [];
    let pos = 0;

    while (pos < data.length) {
      const match = this.findLongestMatch(data, pos);

      if (match.length >= 3) { // Minimum match length
        // Add literal byte before match if needed
        if (match.distance > match.length) {
          compressed.push({
            type: 'literal',
            value: data[pos]
          });
          pos++;
        } else {
          // Add match
          compressed.push({
            type: 'match',
            length: match.length,
            distance: match.distance
          });
          pos += match.length;
        }
      } else {
        // Add literal byte
        compressed.push({
          type: 'literal',
          value: data[pos]
        });
        pos++;
      }
    }

    return compressed;
  }

  // Decompress LZ77 data
  decompress(compressed) {
    const decompressed = [];
    let pos = 0;

    for (const token of compressed) {
      if (token.type === 'literal') {
        decompressed.push(token.value);
      } else if (token.type === 'match') {
        const start = decompressed.length - token.distance;
        for (let i = 0; i < token.length; i++) {
          decompressed.push(decompressed[start + i]);
        }
      }
    }

    return decompressed.join('');
  }

  // Serialize compressed data for transmission
  serialize(compressed) {
    let result = '';
    for (const token of compressed) {
      if (token.type === 'literal') {
        result += '0'; // 0 = literal
        result += toBinaryString(token.value.charCodeAt(0), 8);
      } else {
        result += '1'; // 1 = match
        result += toBinaryString(token.length, 8);
        result += toBinaryString(token.distance, 12); // 12 bits for distance
      }
    }
    return result;
  }

  // Deserialize compressed data
  deserialize(data) {
    const compressed = [];
    let pos = 0;

    while (pos < data.length) {
      const type = data[pos];
      pos++;

      if (type === '0') { // literal
        const byteStr = data.slice(pos, pos + 8);
        const charCode = fromBinaryString(byteStr);
        compressed.push({
          type: 'literal',
          value: String.fromCharCode(charCode)
        });
        pos += 8;
      } else { // match
        const lengthStr = data.slice(pos, pos + 8);
        const distanceStr = data.slice(pos + 8, pos + 20);
        const length = fromBinaryString(lengthStr);
        const distance = fromBinaryString(distanceStr);
        compressed.push({
          type: 'match',
          length,
          distance
        });
        pos += 20;
      }
    }

    return compressed;
  }
}

// Global compressor instance
export const compressor = new LZ77Compressor();

// Compress data before transmission
export function compressData(data, enableCompression = true) {
  if (!enableCompression || data.length < 100) { // Don't compress small data
    return { compressed: false, data };
  }

  try {
    const compressed = compressor.compress(data);
    const serialized = compressor.serialize(compressed);

    // Only use compression if it's actually smaller
    if (serialized.length < data.length * 8) { // Compare bit lengths
      return {
        compressed: true,
        data: serialized,
        originalSize: data.length,
        compressedSize: Math.ceil(serialized.length / 8)
      };
    }
  } catch (error) {
    console.warn('Compression failed:', error);
  }

  return { compressed: false, data };
}

// Decompress received data
export function decompressData(data, compressionInfo) {
  if (!compressionInfo.compressed) {
    return data;
  }

  try {
    const deserialized = compressor.deserialize(data);
    return compressor.decompress(deserialized);
  } catch (error) {
    console.error('Decompression failed:', error);
    return data; // Return original data on failure
  }
}

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
export function createPacket(type, payload, flags = 0) {
  const typeBits = type;
  const flagsBits = toBinaryString(flags, 8);
  const lengthBits = toBinaryString(payload.length, 16);
  const payloadBits = payload.split('').map(char =>
    toBinaryString(char.charCodeAt(0), 8)
  ).join('');
  const checksumBits = toBinaryString(calculateCRC16(payload), 16);

  return [
    PACKET_CONSTANTS.START_FRAME,
    typeBits,
    flagsBits,
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

    // Read flags (8 bits)
    const flagsBits = receivedBits.slice(bitIndex, bitIndex + 8).join('');
    const flags = fromBinaryString(flagsBits);
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
      flags: flags,
      payload: payloadStr,
      valid: true
    };

  } catch (error) {
    return {
      type: null,
      flags: 0,
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