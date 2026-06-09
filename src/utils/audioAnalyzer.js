/**
 * Audio Analyzer Utility
 * Implements client-side Digital Signal Processing (DSP) for:
 * 1. BPM / Tempo detection using low-pass filtering and peak-interval tracking.
 * 2. Key detection using FFT, Chromagram extraction, and Krumhansl-Schmuckler profile correlation.
 * 3. Outro point detection by profiling RMS energy over the last 2 minutes of the track.
 */

// Krumhansl-Schmuckler Key Profiles
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Camelot Code Map: maps note names + scale to Camelot Code
// Key format: "Note Major" or "Note Minor"
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
 * Decode file object to AudioBuffer
 */
export async function decodeAudioFile(file, audioCtx) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        // Decode audio
        audioCtx.decodeAudioData(arrayBuffer, (decodedData) => {
          resolve(decodedData);
        }, (err) => {
          reject(new Error("Error decodificando audio: " + err.message));
        });
      } catch (err) {
        reject(err);
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
  return new Promise((resolve, reject) => {
    audioCtx.decodeAudioData(arrayBuffer, (decodedData) => {
      resolve(decodedData);
    }, (err) => {
      reject(new Error("Error decodificando audio desde URL: " + err.message));
    });
  });
}

/**
 * Detect BPM of an AudioBuffer
 * Uses an OfflineAudioContext with a low-pass filter to isolate kick drums/beats,
 * then extracts peaks and calculates a histogram of beat intervals.
 */
export async function detectBPM(audioBuffer) {
  const sampleRate = 22050; // Downsample for faster analysis
  const duration = audioBuffer.duration;
  
  // Create offline context
  const offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
  
  // Source node
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  
  // Low-pass filter (isolate kick drum transients)
  const filter = offlineCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 150; 
  filter.Q.value = 1.0;
  
  source.connect(filter);
  filter.connect(offlineCtx.destination);
  source.start(0);
  
  // Render
  const renderedBuffer = await offlineCtx.startRendering();
  const data = renderedBuffer.getChannelData(0);
  
  // Peak Detection
  // Divide the track into 1-second chunks and find local peaks
  const step = Math.floor(sampleRate); // 1 second chunks
  const peaks = [];
  
  // Get global max absolute amplitude
  let globalMax = 0;
  for (let i = 0; i < data.length; i++) {
    const val = Math.abs(data[i]);
    if (val > globalMax) globalMax = val;
  }
  
  const threshold = globalMax * 0.6; // 60% of peak level
  
  // Minimum distance between peaks (0.25 seconds = 240 BPM max)
  const minSpacing = Math.floor(sampleRate * 0.25);
  let lastPeakPos = -minSpacing;
  
  for (let i = 0; i < data.length; i++) {
    const val = Math.abs(data[i]);
    if (val > threshold && (i - lastPeakPos) > minSpacing) {
      // Confirm it's a local maximum
      let isLocalMax = true;
      const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
      for (let w = -windowSize; w <= windowSize; w++) {
        if (i + w >= 0 && i + w < data.length) {
          if (Math.abs(data[i + w]) > val) {
            isLocalMax = false;
            break;
          }
        }
      }
      
      if (isLocalMax) {
        peaks.push(i);
        lastPeakPos = i;
      }
    }
  }
  
  if (peaks.length < 10) {
    // Fallback if not enough peaks detected
    return { bpm: 120, firstBeatOffset: 0.0 };
  }
  
  // Calculate intervals (intervals between peaks in samples)
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Map intervals to BPM candidates
  const bpmCandidates = intervals.map(interval => {
    const secondsPerBeat = interval / sampleRate;
    let bpm = 60 / secondsPerBeat;
    
    // Normalize BPM to a standard DJ range (75 - 150 BPM)
    while (bpm < 75) bpm *= 2;
    while (bpm > 150) bpm /= 2;
    
    return Math.round(bpm);
  });
  
  // Build histogram
  const histogram = {};
  bpmCandidates.forEach(bpm => {
    histogram[bpm] = (histogram[bpm] || 0) + 1;
    // Also add minor weights to adjacent BPMs for smoothing
    histogram[bpm - 1] = (histogram[bpm - 1] || 0) + 0.3;
    histogram[bpm + 1] = (histogram[bpm + 1] || 0) + 0.3;
  });
  
  // Find highest peak in histogram
  let bestBpm = 120;
  let maxCount = 0;
  Object.keys(histogram).forEach(bpm => {
    if (histogram[bpm] > maxCount) {
      maxCount = histogram[bpm];
      bestBpm = parseInt(bpm);
    }
  });
  
  return { bpm: bestBpm, firstBeatOffset: parseFloat((peaks[0] / sampleRate).toFixed(3)) };
}

/**
 * Detect Key of an AudioBuffer
 * Takes 8 segments in the middle of the song, computes a 4096-point FFT,
 * extracts pitch-class energies (Chroma Vector), and correlates them
 * with Krumhansl-Schmuckler major/minor templates.
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
    // We analyze bin by bin up to Nyquist frequency (fftSize/2)
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

/**
 * Detect Outro Point
 * Scans the last 2 minutes of the song. Calculates RMS energy of 1-second chunks.
 * Outro point is defined as the first moment (moving forward) where volume drops
 * below a threshold (20% of maximum RMS) and remains low.
 */
export function detectOutro(audioBuffer) {
  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0);
  
  // We check the last 2 minutes (120 seconds), or the whole song if shorter
  const scanDuration = Math.min(120, duration);
  const scanStartSec = duration - scanDuration;
  
  const blockSize = Math.floor(sampleRate); // 1-second block
  const numBlocks = Math.floor(scanDuration);
  
  const rmsValues = [];
  
  // Calculate RMS for each 1-second block in the scan window
  for (let b = 0; b < numBlocks; b++) {
    const blockStart = Math.floor((scanStartSec + b) * sampleRate);
    let sumSquares = 0;
    
    // Compute RMS
    for (let i = 0; i < blockSize; i++) {
      if (blockStart + i < data.length) {
        const val = data[blockStart + i];
        sumSquares += val * val;
      }
    }
    const rms = Math.sqrt(sumSquares / blockSize);
    rmsValues.push(rms);
  }
  
  // Find max RMS in this final region to use as volume baseline
  let maxRms = 0;
  rmsValues.forEach(v => { if (v > maxRms) maxRms = v; });
  if (maxRms === 0) maxRms = 1;
  
  // Find point where volume drops below 55% of max RMS and stays below 65%
  // This detects the transition into the simpler outro beat loop in electronic music.
  let outroBlockIdx = -1;
  const threshold = maxRms * 0.55;
  const releaseThreshold = maxRms * 0.65;
  
  for (let i = 0; i < rmsValues.length; i++) {
    if (rmsValues[i] < threshold) {
      // Verify it stays low for the remainder of the blocks
      let staysLow = true;
      for (let j = i + 1; j < rmsValues.length; j++) {
        if (rmsValues[j] > releaseThreshold) {
          staysLow = false;
          break;
        }
      }
      
      if (staysLow) {
        outroBlockIdx = i;
        break;
      }
    }
  }
  
  // Calculate final timestamp
  // For standard tracks, we target a fade of 90 seconds. For short tracks, we target 50% of the duration.
  const targetHeadroom = Math.min(90, duration * 0.5);
  let outroTime = duration - targetHeadroom;
  if (outroBlockIdx !== -1) {
    outroTime = scanStartSec + outroBlockIdx;
  }
  
  // Clamp: Outro must be scheduled between 90s and 120s before the end for long tracks
  // to ensure a smooth 90-120s transition. For shorter tracks, we scale down to targetHeadroom.
  const maxOutroTime = duration - targetHeadroom;
  const minOutroTime = Math.max(0, duration - Math.min(120, duration * 0.6));
  outroTime = Math.max(minOutroTime, Math.min(maxOutroTime, outroTime));
  
  return parseFloat(outroTime.toFixed(2));
}

/**
 * Check if two Camelot Keys are compatible
 * Rules:
 * - Same key: e.g. 8A and 8A
 * - Adjacent numbers: e.g. 8A and 7A, 8A and 9A (with wrapping 12 <-> 1)
 * - Relative major/minor: e.g. 8A and 8B
 */
export function areKeysCompatible(keyA, keyB) {
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  
  // Extract number and mode letter
  const numA = parseInt(keyA.slice(0, -1));
  const letterA = keyA.slice(-1);
  const numB = parseInt(keyB.slice(0, -1));
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

/**
 * Detect Intro / Drop Point
 * Scans the first 60 seconds of the track (in 1-second chunks).
 * Calculates RMS energy (volume) for each block.
 * Identifies the drop point where there is a significant energy increase
 * followed by sustained higher energy.
 */
export function detectIntro(audioBuffer, bpm) {
  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0);

  // We scan the first 120 seconds (or duration if shorter)
  const scanDuration = Math.min(120, duration);
  const blockSize = Math.floor(sampleRate); // 1-second block
  const numBlocks = Math.floor(scanDuration);

  const rmsValues = [];
  
  // Calculate RMS for each 1-second block in the intro region
  for (let b = 0; b < numBlocks; b++) {
    const blockStart = b * blockSize;
    let sumSquares = 0;
    
    for (let i = 0; i < blockSize; i++) {
      if (blockStart + i < data.length) {
        const val = data[blockStart + i];
        sumSquares += val * val;
      }
    }
    const rms = Math.sqrt(sumSquares / blockSize);
    rmsValues.push(rms);
  }

  // Get average RMS across the entire scan window to use as a baseline
  let sumRms = 0;
  rmsValues.forEach(v => sumRms += v);
  const avgRms = sumRms / (rmsValues.length || 1);

  // Find the block with the largest positive delta in volume (the entry/drop)
  let dropBlockIdx = -1;
  let maxDelta = 0;

  // We start scanning from block 4 to allow at least 4 seconds of intro
  for (let i = 4; i < rmsValues.length; i++) {
    const delta = rmsValues[i] - rmsValues[i - 1];
    
    // The drop must be a positive energy increase, and the volume after the drop
    // (next 4 seconds) must remain above the average volume to confirm it's not a temporary spike.
    if (delta > maxDelta) {
      let isSustained = true;
      const checkEnd = Math.min(rmsValues.length, i + 4);
      for (let j = i; j < checkEnd; j++) {
        if (rmsValues[j] < avgRms * 0.8) {
          isSustained = false;
          break;
        }
      }

      if (isSustained) {
        maxDelta = delta;
        dropBlockIdx = i;
      }
    }
  }

  let introTime = 16.0; // Fallback: 16 seconds (8 bars at 120 BPM)
  if (bpm && bpm > 0) {
    // Standard musical intro lengths: 16, 24, or 32 seconds
    // Let's use 32 beats as standard fallback: (32 * 60) / bpm
    introTime = (32 * 60) / bpm;
  }

  if (dropBlockIdx !== -1) {
    introTime = dropBlockIdx;
  }

  // Clamp the intro time: minimum 4 seconds, maximum 90 seconds (safety range)
  introTime = Math.max(4.0, Math.min(90.0, introTime));

  return parseFloat(introTime.toFixed(2));
}

// --- MUSIC STYLE / GENRE DETECTION FEATURE ---

import { GENRE_PROFILES, GENRE_COLORS, GENRE_EMOJIS } from '../constants/genreProfiles';
export { GENRE_PROFILES, GENRE_COLORS, GENRE_EMOJIS };

/**
 * Extract spectral and onset features from an AudioBuffer.
 * Calculates Spectral Centroid, Bass Energy Ratio, and Onset Density.
 */
export function extractSpectralFeatures(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const fftSize = 4096;

  // 1. Spectral Centroid and Bass Energy Ratio using 8 FFT windows in the middle (30%-70%)
  const numWindows = 8;
  const startOffset = Math.floor(data.length * 0.3);
  const endOffset = Math.floor(data.length * 0.7);
  const step = Math.floor((endOffset - startOffset) / numWindows);

  let centroidSum = 0;
  let bassRatioSum = 0;
  let analyzedWindowsCount = 0;

  for (let w = 0; w < numWindows; w++) {
    const windowStart = startOffset + w * step;
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);

    // hann window and copy
    for (let i = 0; i < fftSize; i++) {
      if (windowStart + i < data.length) {
        const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
        re[i] = data[windowStart + i] * multiplier;
      }
    }

    fft(re, im);

    let sumFreqMag = 0;
    let sumMag = 0;
    let bassEnergy = 0;
    let totalEnergy = 0;

    for (let k = 1; k < fftSize / 2; k++) {
      const freq = (k * sampleRate) / fftSize;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const energy = re[k] * re[k] + im[k] * im[k];

      sumFreqMag += freq * mag;
      sumMag += mag;

      totalEnergy += energy;
      if (freq < 250) {
        bassEnergy += energy;
      }
    }

    if (sumMag > 0) {
      const windowCentroid = sumFreqMag / sumMag;
      const windowBassRatio = totalEnergy > 0 ? (bassEnergy / totalEnergy) : 0;

      centroidSum += windowCentroid;
      bassRatioSum += windowBassRatio;
      analyzedWindowsCount++;
    }
  }

  const avgCentroid = analyzedWindowsCount > 0 ? (centroidSum / analyzedWindowsCount) : 2500;
  const avgBassRatio = analyzedWindowsCount > 0 ? (bassRatioSum / analyzedWindowsCount) : 0.3;

  // 2. Onset Density (percussive attacks per second) over a 30s window (seconds 15 to 45)
  const windowStartSec = Math.max(0, Math.min(15, audioBuffer.duration - 30));
  const windowDurationSec = Math.min(30, audioBuffer.duration - windowStartSec);
  const startIndex = Math.floor(windowStartSec * sampleRate);
  const endIndex = Math.floor((windowStartSec + windowDurationSec) * sampleRate);

  const frameSizeMs = 20;
  const frameSize = Math.floor(sampleRate * (frameSizeMs / 1000));
  const numFrames = Math.floor((endIndex - startIndex) / frameSize);

  const envelope = [];
  for (let n = 0; n < numFrames; n++) {
    let sumSquares = 0;
    const frameStart = startIndex + n * frameSize;
    for (let i = 0; i < frameSize; i++) {
      if (frameStart + i < data.length) {
        const val = data[frameStart + i];
        sumSquares += val * val;
      }
    }
    envelope.push(Math.sqrt(sumSquares / frameSize));
  }

  // First-order difference with Half-Wave Rectification
  const diffs = [];
  let maxDiff = 0;
  for (let n = 1; n < envelope.length; n++) {
    const diff = Math.max(0, envelope[n] - envelope[n - 1]);
    diffs.push(diff);
    if (diff > maxDiff) maxDiff = diff;
  }

  // Peak detection
  let onsetCount = 0;
  const threshold = maxDiff * 0.15 + 0.005; // 15% of max peak + absolute noise floor
  const minSpacing = 5; // ~100ms minimum spacing (5 frames * 20ms)
  let lastPeakIndex = -minSpacing;

  for (let i = 1; i < diffs.length - 1; i++) {
    if (diffs[i] > threshold && diffs[i] >= diffs[i - 1] && diffs[i] >= diffs[i + 1]) {
      if (i - lastPeakIndex >= minSpacing) {
        onsetCount++;
        lastPeakIndex = i;
      }
    }
  }

  const onsetDensity = windowDurationSec > 0 ? (onsetCount / windowDurationSec) : 0;

  return {
    spectralCentroid: Math.round(avgCentroid),
    bassEnergyRatio: parseFloat(avgBassRatio.toFixed(3)),
    onsetDensity: parseFloat(onsetDensity.toFixed(2))
  };
}

/**
 * Classify the music style based on BPM and spectral features using a multivariate Gaussian model.
 */
export function classifyGenre(bpm, features) {
  let bestGenre = 'Ambient/Chill';
  let bestScore = -1;
  const scores = [];

  for (const profile of GENRE_PROFILES) {
    // Calculate 1D Gaussian similarity match for each feature
    const bpmMatch = Math.exp(-0.5 * Math.pow((bpm - profile.bpm.mid) / profile.bpm.sigma, 2));
    const centroidMatch = Math.exp(-0.5 * Math.pow((features.spectralCentroid - profile.centroid.mid) / profile.centroid.sigma, 2));
    const bassMatch = Math.exp(-0.5 * Math.pow((features.bassEnergyRatio - profile.bassRatio.mid) / profile.bassRatio.sigma, 2));
    const onsetMatch = Math.exp(-0.5 * Math.pow((features.onsetDensity - profile.onsetDensity.mid) / profile.onsetDensity.sigma, 2));

    // Weighted distance scoring
    const w_bpm = 0.40;
    const w_sc = 0.25;
    const w_ber = 0.20;
    const w_od = 0.15;

    const score = w_bpm * bpmMatch + w_sc * centroidMatch + w_ber * bassMatch + w_od * onsetMatch;
    scores.push({ name: profile.name, score });

    if (score > bestScore) {
      bestScore = score;
      bestGenre = profile.name;
    }
  }

  // Sort scores to determine confidence
  scores.sort((a, b) => b.score - a.score);
  const confidence = Math.round(bestScore * 100);

  return {
    genre: bestGenre,
    confidence: Math.min(100, Math.max(10, confidence))
  };
}

/**
 * Detect music style from AudioBuffer and previously detected BPM.
 */
export function detectGenre(audioBuffer, bpm) {
  try {
    const features = extractSpectralFeatures(audioBuffer);
    const { genre, confidence } = classifyGenre(bpm, features);
    return { genre, confidence, features };
  } catch (err) {
    console.error("Error detecting music style:", err);
    return { genre: 'Ambient/Chill', confidence: 20, features: { spectralCentroid: 1500, bassEnergyRatio: 0.15, onsetDensity: 0.5 } };
  }
}
