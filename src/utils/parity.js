// Calculate even parity bit for a string of binary digits
// Returns the parity bit (0 or 1) to make total 1s even
export function calculateParityBit(binaryString) {
  let count = 0;
  for (let i = 0; i < binaryString.length; i++) {
    if (binaryString[i] === '1') count++;
  }
  return count % 2 === 0 ? '0' : '1';
}

// Validate parity for a 9-bit string (8 data + 1 parity)
// Returns true if parity is valid (even number of 1s)
export function validateParity(binaryString) {
  if (binaryString.length !== 9) return false;
  let count = 0;
  for (let i = 0; i < binaryString.length; i++) {
    if (binaryString[i] === '1') count++;
  }
  return count % 2 === 0;
}