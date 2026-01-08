// Calculate luma (brightness) from RGB values
// Y = 0.299R + 0.587G + 0.114B
export function calculateLuma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Calculate brightness threshold logic
// Bright = 1, Dark = 0
export function getBitFromBrightness(brightness, threshold) {
  return brightness > threshold ? 1 : 0;
}