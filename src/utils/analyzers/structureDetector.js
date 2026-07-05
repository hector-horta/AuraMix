/**
 * Structure Detector Utility
 * Detects structural markers in audio:
 * - Outro point (drop in RMS energy at the end)
 * - Intro / Drop point (energy rise at the beginning)
 * - High-frequency position ("forward" vs "backward")
 */

/**
 * Detect Outro Point
 * Scans the last 2 minutes of the song. Calculates RMS energy of 1-second chunks.
 * Outro point is defined as the first moment (moving forward) where volume drops
 * below a threshold (55% of maximum RMS) and remains low.
 * @param {AudioBuffer} audioBuffer
 * @returns {number} Outro timestamp in seconds
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
  const targetHeadroom = Math.min(90, duration * 0.5);
  let outroTime = duration - targetHeadroom;
  if (outroBlockIdx !== -1) {
    outroTime = scanStartSec + outroBlockIdx;
  }
  
  // Clamp: Outro must be scheduled between 90s and 120s before the end for long tracks
  const maxOutroTime = duration - targetHeadroom;
  const minOutroTime = Math.max(0, duration - Math.min(120, duration * 0.6));
  outroTime = Math.max(minOutroTime, Math.min(maxOutroTime, outroTime));
  
  return parseFloat(outroTime.toFixed(2));
}

/**
 * Detect Intro / Drop Point
 * Scans the first 120 seconds of the track (in 1-second chunks).
 * Calculates RMS energy for each block.
 * Identifies the drop point where there is a significant energy increase
 * followed by sustained higher energy.
 * @param {AudioBuffer} audioBuffer
 * @param {number} bpm
 * @returns {number} Intro timestamp in seconds
 */
export function detectIntro(audioBuffer, bpm) {
  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0);

  const scanDuration = Math.min(120, duration);
  const blockSize = Math.floor(sampleRate); // 1-second block
  const numBlocks = Math.floor(scanDuration);

  const rmsValues = [];
  
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

  let sumRms = 0;
  rmsValues.forEach(v => sumRms += v);
  const avgRms = sumRms / (rmsValues.length || 1);

  let dropBlockIdx = -1;
  let maxDelta = 0;

  for (let i = 4; i < rmsValues.length; i++) {
    const delta = rmsValues[i] - rmsValues[i - 1];
    
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

  let introTime = 16.0;
  if (bpm && bpm > 0) {
    introTime = (32 * 60) / bpm;
  }

  if (dropBlockIdx !== -1) {
    introTime = dropBlockIdx;
  }

  introTime = Math.max(4.0, Math.min(90.0, introTime));

  return parseFloat(introTime.toFixed(2));
}

/**
 * Detect high-frequency positioning ("forward" vs "backward")
 * Compares the RMS of the high-pass filtered audio (above 7.5 kHz)
 * with the RMS of the unfiltered audio in a 10-second segment from the middle of the track.
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<'forward' | 'backward'>}
 */
export async function detectHighsPosition(audioBuffer) {
  try {
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const data = audioBuffer.getChannelData(0);

    const scanDuration = Math.min(10, duration);
    const scanStartSec = Math.max(0, duration * 0.5 - scanDuration * 0.5);
    const startSample = Math.floor(scanStartSec * sampleRate);
    const numSamples = Math.floor(scanDuration * sampleRate);

    let sumSquaresUnfiltered = 0;
    for (let i = 0; i < numSamples; i++) {
      const idx = startSample + i;
      if (idx < data.length) {
        const val = data[idx];
        sumSquaresUnfiltered += val * val;
      }
    }
    const rmsUnfiltered = Math.sqrt(sumSquaresUnfiltered / numSamples) || 0.0001;

    const offlineCtx = new OfflineAudioContext(1, numSamples, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;
    filter.Q.value = 1.0;

    source.connect(filter);
    filter.connect(offlineCtx.destination);
    source.start(0, scanStartSec, scanDuration);

    const renderedBuffer = await offlineCtx.startRendering();
    const filteredData = renderedBuffer.getChannelData(0);

    let sumSquaresFiltered = 0;
    for (let i = 0; i < filteredData.length; i++) {
      const val = filteredData[i];
      sumSquaresFiltered += val * val;
    }
    const rmsFiltered = Math.sqrt(sumSquaresFiltered / filteredData.length) || 0.0001;

    const ratio = rmsFiltered / rmsUnfiltered;
    return ratio >= 0.075 ? 'forward' : 'backward';
  } catch (err) {
    console.error("Error analyzing highs position:", err);
    return 'forward';
  }
}
