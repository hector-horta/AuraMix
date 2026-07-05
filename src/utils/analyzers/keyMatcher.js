/**
 * Camelot Key Matching Utility
 * Validates harmonic compatibility between two Camelot Key codes.
 */

/**
 * Check if two Camelot Keys are compatible
 * Rules:
 * - Same key: e.g. 8A and 8A
 * - Adjacent numbers: e.g. 8A and 7A, 8A and 9A (with wrapping 12 <-> 1)
 * - Relative major/minor: e.g. 8A and 8B
 * @param {string} keyA
 * @param {string} keyB
 * @returns {boolean}
 */
export function areKeysCompatible(keyA, keyB) {
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  
  // Extract number and mode letter
  const numA = parseInt(keyA.slice(0, -1), 10);
  const letterA = keyA.slice(-1);
  const numB = parseInt(keyB.slice(0, -1), 10);
  const letterB = keyB.slice(-1);
  
  const isAdjacent = (numA === numB + 1 || numA === numB - 1 || 
                     (numA === 12 && numB === 1) || (numA === 1 && numB === 12));
                     
  if (letterA === letterB) {
    return isAdjacent;
  } else {
    // Relative Major/Minor swap (must have same number, e.g. 8A and 8B)
    return numA === numB;
  }
}
