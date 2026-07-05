/**
 * Audio Analyzer Hub
 * Re-exports specialized sub-analyzers for backwards compatibility.
 */

export { detectBPM } from './analyzers/bpmDetector.js';
export { detectKey } from './analyzers/keyDetector.js';
export { detectOutro, detectIntro, detectHighsPosition } from './analyzers/structureDetector.js';
export { areKeysCompatible } from './analyzers/keyMatcher.js';

/**
 * Decode file object to AudioBuffer
 */
export async function decodeAudioFile(file, audioCtx) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
        resolve(decodedData);
      } catch (err) {
        reject(new Error("Error decodificando audio: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("Error leyendo el archivo"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Decode audio from a URL to AudioBuffer
 */
export async function decodeAudioFromUrl(url, audioCtx) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  try {
    const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
    return decodedData;
  } catch (err) {
    throw new Error("Error decodificando audio desde URL: " + err.message);
  }
}
