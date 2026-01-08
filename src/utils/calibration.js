// Calibration state machine
export const CALIBRATION_STATES = {
  IDLE: 'IDLE',
  CALIBRATING: 'CALIBRATING',
  CALIBRATED: 'CALIBRATED'
};

// Calculate ambient brightness threshold
// Sample for ~1 second, compute average brightness + margin
export function calculateThreshold(samples, margin = 50) {
  if (samples.length === 0) return 128; // default

  const sum = samples.reduce((acc, val) => acc + val, 0);
  const average = sum / samples.length;
  return average + margin;
}