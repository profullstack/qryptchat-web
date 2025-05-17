/**
 * CRYSTALS-Kyber module for quantum-resistant cryptography
 * This is a wrapper around the crystals-kyber-js library
 */

// Import the MlKem768 class from the ESM module
import { MlKem768 } from 'https://esm.sh/crystals-kyber-js';

// Export the MlKem768 class for use in the application
export { MlKem768 };

// Export a helper function to create a new instance
export function createKyber() {
  return new MlKem768();
}