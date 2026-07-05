/**
 * BPM (Tempo) Detection Utility
 * Uses an OfflineAudioContext with a low-pass filter to isolate kick drums/beats,
 * then extracts peaks and calculates a histogram of beat intervals.
 */

/**
 * Detect BPM of an AudioBuffer
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<{ bpm: number, firstBeatOffset: number }>}
 */
export async function detectBPM(audioBuffer) {
  const sampleRate = 22050; // Downsample for faster analysis
  const duration = audioBuffer.duration;
  
  // Create offline context
  const offlineCtx = new OfflineAudioContext(1, Math.floor(sampleRate * duration), sampleRate);
  
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
  const peaks = [];
  
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
      bestBpm = parseInt(bpm, 10);
    }
  });
  
  return { bpm: bestBpm, firstBeatOffset: parseFloat((peaks[0] / sampleRate).toFixed(3)) };
}
