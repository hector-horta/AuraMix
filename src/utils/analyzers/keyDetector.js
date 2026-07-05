/**
 * Musical Key Detection Utility
 * Uses FFT, Chromagram extraction, and Krumhansl-Schmuckler profile correlation
 * to determine musical key and Camelot Code.
 */

// Krumhansl-Schmuckler Key Profiles
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Camelot Code Map: maps note names + scale to Camelot Code
const CAMELOT_MAP = {
  'G# Minor': '1A', 'B Major': '1B',
  'D# Minor': '2A', 'F# Major': '2B',
  'A# Minor': '3A', 'C# Major': '3B',
  'F Minor': '4A', 'G# Major': '4B',
  'C Minor': '5A', 'D# Major': '5B',
  'G Minor': '6A', 'A# Major': '6B',
  'D Minor': '7A', 'F Major': '7B',
  'A Minor': '8A', 'C Major': '8B',
  'E Minor': '9A', 'G Major': '9B',
  'B Minor': '10A', 'D Major': '10B',
  'F# Minor': '11A', 'A Major': '11B',
  'C# Minor': '12A', 'E Major': '12B',
};

/**
 * Radix-2 Cooley-Tukey Fast Fourier Transform (FFT)
 */
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  const reEven = new Float32Array(n / 2);
  const imEven = new Float32Array(n / 2);
  const reOdd = new Float32Array(n / 2);
  const imOdd = new Float32Array(n / 2);

  for (let i = 0; i < n / 2; i++) {
    reEven[i] = re[2 * i];
    imEven[i] = im[2 * i];
    reOdd[i] = re[2 * i + 1];
    imOdd[i] = im[2 * i + 1];
  }

  fft(reEven, imEven);
  fft(reOdd, imOdd);

  for (let k = 0; k < n / 2; k++) {
    const angle = -2 * Math.PI * k / n;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tRe = reOdd[k] * cos - imOdd[k] * sin;
    const tIm = reOdd[k] * sin + imOdd[k] * cos;

    re[k] = reEven[k] + tRe;
    im[k] = imEven[k] + tIm;
    re[k + n / 2] = reEven[k] - tRe;
    im[k + n / 2] = imEven[k] - tIm;
  }
}

/**
 * Pearson correlation coefficient between two vectors
 */
function correlation(x, y) {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0;
  let sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return num / den;
}

/**
 * Detect Key of an AudioBuffer
 * Takes 8 segments in the middle of the song, computes a 4096-point FFT,
 * extracts pitch-class energies (Chroma Vector), and correlates them
 * with Krumhansl-Schmuckler major/minor templates.
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<{ keyName: string, camelot: string }>}
 */
export async function detectKey(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fftSize = 4096;
  
  // We'll analyze 8 windows in the middle of the song (from 30% to 70% mark)
  const numWindows = 8;
  const chroma = new Float32Array(12);
  
  const startOffset = Math.floor(data.length * 0.3);
  const endOffset = Math.floor(data.length * 0.7);
  const step = Math.floor((endOffset - startOffset) / numWindows);
  
  for (let w = 0; w < numWindows; w++) {
    const windowStart = startOffset + w * step;
    
    // Copy samples and apply a Hann window
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      if (windowStart + i < data.length) {
        // Hann window
        const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
        re[i] = data[windowStart + i] * multiplier;
      }
    }
    
    // Compute FFT
    fft(re, im);
    
    // Accumulate frequency energies into pitch classes
    for (let k = 1; k < fftSize / 2; k++) {
      const freq = (k * sampleRate) / fftSize;
      
      // Focus on standard instrument range: 50 Hz to 2000 Hz
      if (freq >= 50 && freq <= 2000) {
        const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        
        // Convert frequency to MIDI note number: n = 12 * log2(f / 440) + 69
        const midiNote = 12 * Math.log2(freq / 440) + 69;
        const pitchClass = Math.round(midiNote) % 12;
        
        if (pitchClass >= 0 && pitchClass < 12) {
          chroma[pitchClass] += magnitude;
        }
      }
    }
  }
  
  // Normalize Chroma Vector
  let maxChroma = 0;
  for (let i = 0; i < 12; i++) {
    if (chroma[i] > maxChroma) maxChroma = chroma[i];
  }
  if (maxChroma > 0) {
    for (let i = 0; i < 12; i++) {
      chroma[i] /= maxChroma;
    }
  }
  
  // Correlation with KS Key Profiles
  let bestKey = "";
  let maxCorr = -2; // Pearson is between -1 and 1
  
  // Test all 12 tonics
  for (let tonic = 0; tonic < 12; tonic++) {
    // Rotate chroma so candidate tonic is at index 0
    const rotatedChroma = new Float32Array(12);
    for (let i = 0; i < 12; i++) {
      rotatedChroma[i] = chroma[(i + tonic) % 12];
    }
    
    // Correlate with Major template
    const corrMajor = correlation(rotatedChroma, KS_MAJOR);
    if (corrMajor > maxCorr) {
      maxCorr = corrMajor;
      bestKey = `${NOTE_NAMES[tonic]} Major`;
    }
    
    // Correlate with Minor template
    const corrMinor = correlation(rotatedChroma, KS_MINOR);
    if (corrMinor > maxCorr) {
      maxCorr = corrMinor;
      bestKey = `${NOTE_NAMES[tonic]} Minor`;
    }
  }
  
  // Map to Camelot
  const camelot = CAMELOT_MAP[bestKey] || "8A"; // Fallback to 8A (A Minor)
  
  return {
    keyName: bestKey,
    camelot: camelot
  };
}
