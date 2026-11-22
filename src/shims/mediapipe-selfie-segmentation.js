/**
 * Shim for @mediapipe/selfie_segmentation
 * The original package is a Closure Library build that doesn't export ES modules.
 * This shim provides a minimal SelfieSegmentation class that works with the TFJS backend.
 */

// Re-export TensorFlow.js for internal use
export * from '@tensorflow/tfjs';

/**
 * Minimal SelfieSegmentation class for compatibility
 * The actual implementation uses TFJS backend, not MediaPipe
 */
export class SelfieSegmentation {
  constructor(config = {}) {
    this.config = config;
    this.initialized = false;
  }

  async initialize() {
    // No-op for TFJS backend
    this.initialized = true;
    return this;
  }

  async segmentPeople(image, config) {
    // This should not be called when using TFJS backend
    // The body-segmentation library handles routing to the correct backend
    throw new Error('SelfieSegmentation MediaPipe backend not available. Use TFJS backend instead.');
  }

  dispose() {
    this.initialized = false;
  }

  reset() {
    // No-op
  }
}

// Default export for compatibility
export default SelfieSegmentation;