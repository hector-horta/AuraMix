/**
 * Transition Engine Module
 * Pure functions for calculating beat alignment, transition timing,
 * and scheduling EQ ramps on Web Audio API nodes.
 */

/**
 * Map EQ band names to node property names.
 */
export const BAND_NODES = {
  low: 'lowShelf',
  mid: 'midPeaking',
  high: 'highShelf'
};

/**
 * Calculate the beat-aligned start time for the incoming deck.
 * @param {AudioContext} ctx
 * @param {Object} nodesFrom - Audio nodes of the outgoing deck.
 * @param {Object} fromTrack - The outgoing track metadata.
 * @param {number} pitchFrom - Current pitch offset of the outgoing deck.
 * @param {Object} targetTrack - The incoming track metadata.
 * @param {number} pitchOffset - Pitch offset for the incoming deck.
 * @param {number} pausedAtTo - The paused position of the incoming deck.
 * @param {number} masterBpm - The master BPM.
 * @returns {{ startTime: number, delay: number, highPrecisionTime: number }}
 */
export function calculateBeatAlignment(ctx, nodesFrom, fromTrack, pitchFrom, targetTrack, pitchOffset, pausedAtTo, masterBpm) {
  const fromBpm = fromTrack ? fromTrack.bpm : 120;
  const playbackRateFrom = 1 + (pitchFrom / 100);
  const firstBeatOffsetFrom = fromTrack ? (fromTrack.firstBeatOffset || 0.0) : 0.0;

  const elapsedSinceStart = Math.max(0, ctx.currentTime - nodesFrom.startTime);
  const highPrecisionTime = nodesFrom.pausedAt + elapsedSinceStart * playbackRateFrom;

  const beatDurationFrom = 60 / fromBpm;
  const timeSinceFirstBeat = highPrecisionTime - firstBeatOffsetFrom;
  const beatOffset = ((timeSinceFirstBeat % beatDurationFrom) + beatDurationFrom) % beatDurationFrom;

  const bufferSecondsToNextBeat = beatDurationFrom - beatOffset;
  const delay = bufferSecondsToNextBeat / playbackRateFrom;
  const targetBeatTime = ctx.currentTime + delay;

  const playbackRateTo = 1 + (pitchOffset / 100);
  const firstBeatOffsetTo = targetTrack ? (targetTrack.firstBeatOffset || 0.0) : 0.0;
  const beatDurationTo = 60 / ((targetTrack ? targetTrack.bpm : 120) || 120);

  const k = Math.max(0, Math.ceil((pausedAtTo - firstBeatOffsetTo) / beatDurationTo));
  const nextBeatPositionTo = firstBeatOffsetTo + k * beatDurationTo;
  const timeToIncomingBeat = (nextBeatPositionTo - pausedAtTo) / playbackRateTo;

  let startTime = targetBeatTime - timeToIncomingBeat;
  const syncedBeatDuration = 60 / masterBpm;
  while (startTime < ctx.currentTime + 0.05) {
    startTime += syncedBeatDuration;
  }

  return { startTime, delay, highPrecisionTime };
}

/**
 * Calculate transition timing: duration, phase lengths, and phase boundaries.
 * @param {number} deckDuration - Total duration of the outgoing deck.
 * @param {number} outroTime - Outro timestamp of the outgoing track.
 * @param {number} introTime - Intro duration of the incoming track.
 * @param {number} highPrecisionTime - Current high-precision time in the outgoing track.
 * @param {number} delay - Delay before the incoming track starts.
 * @param {number} startTime - Calculated start time for the incoming deck.
 * @returns {{ transitionDuration: number, phaseDuration: number, t0: number, t1: number, t2: number, t3: number, remainingTime: number }}
 */
export function calculateTransitionTiming(deckDuration, outroTime, introTime, highPrecisionTime, delay, startTime) {
  const remainingTime = Math.max(2, deckDuration - (highPrecisionTime + delay));
  const outroDuration = Math.max(10, deckDuration - outroTime);
  const introDuration = Math.max(10, introTime);
  const idealTransitionDuration = Math.min(outroDuration, introDuration);
  const transitionDuration = Math.min(idealTransitionDuration, remainingTime);
  const phaseDuration = transitionDuration / 3;

  const t0 = startTime;
  const t1 = t0 + phaseDuration;
  const t2 = t0 + 2 * phaseDuration;
  const t3 = t0 + 3 * phaseDuration;

  return { transitionDuration, phaseDuration, t0, t1, t2, t3, remainingTime, outroDuration, introDuration };
}

/**
 * Schedule EQ band ramps for the 3-phase transition (Auto-DJ mode).
 * @param {Object} nodesFrom - Audio nodes of the outgoing deck.
 * @param {Object} nodesTo - Audio nodes of the incoming deck.
 * @param {Array<string>} eqOrder - Order of EQ bands to swap, e.g. ['mid', 'low', 'high'].
 * @param {Array<number>} times - Phase boundary timestamps [t0, t1, t2, t3].
 * @param {Object} fromEq - Current EQ values of the outgoing deck { low, mid, high }.
 */
export function scheduleEqTransition(nodesFrom, nodesTo, eqOrder, times, fromEq) {
  for (let p = 0; p < 3; p++) {
    const startTimePhase = times[p];
    const endTimePhase = times[p + 1];

    eqOrder.forEach((band, j) => {
      const nodeFrom = nodesFrom[BAND_NODES[band]];
      const nodeTo = nodesTo[BAND_NODES[band]];
      const initialVal = fromEq[band];

      if (j === p) {
        // This band swaps in this phase
        nodeFrom.gain.setValueAtTime(initialVal, startTimePhase);
        nodeFrom.gain.linearRampToValueAtTime(-40, endTimePhase);

        nodeTo.gain.setValueAtTime(-40, startTimePhase);
        nodeTo.gain.linearRampToValueAtTime(0, endTimePhase);
      } else if (j < p) {
        // Already swapped, stays at swapped values
        nodeFrom.gain.setValueAtTime(-40, startTimePhase);
        nodeFrom.gain.setValueAtTime(-40, endTimePhase);

        nodeTo.gain.setValueAtTime(0, startTimePhase);
        nodeTo.gain.setValueAtTime(0, endTimePhase);
      } else {
        // Not yet swapped, stays at initial values
        nodeFrom.gain.setValueAtTime(initialVal, startTimePhase);
        nodeFrom.gain.setValueAtTime(initialVal, endTimePhase);

        nodeTo.gain.setValueAtTime(-40, startTimePhase);
        nodeTo.gain.setValueAtTime(-40, endTimePhase);
      }
    });
  }
}

/**
 * Schedule Jukebox-mode crossfade (volume ramp + pitch ramp).
 * @param {Object} nodesFrom - Audio nodes of the outgoing deck.
 * @param {Object} nodesTo - Audio nodes of the incoming deck.
 * @param {number} t0 - Transition start time.
 * @param {number} t3 - Transition end time.
 * @param {number} fromVolume - Current volume of the outgoing deck.
 * @param {number} targetBpm - BPM of the incoming track.
 * @param {number} fromBpm - BPM of the outgoing track.
 * @param {number} playbackRateFrom - Current playback rate of the outgoing deck.
 */
export function scheduleJukeboxTransition(nodesFrom, nodesTo, t0, t3, fromVolume, targetBpm, fromBpm, playbackRateFrom) {
  // Volume crossfade
  nodesTo.gainNode.gain.setValueAtTime(0.0, t0);
  nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t3);
  nodesFrom.gainNode.gain.setValueAtTime(fromVolume, t0);
  nodesFrom.gainNode.gain.linearRampToValueAtTime(0.0, t3);

  // Pitch ramp for outgoing track to match incoming track's BPM
  if (nodesFrom.source && targetBpm) {
    nodesFrom.source.playbackRate.setValueAtTime(playbackRateFrom, t0);
    nodesFrom.source.playbackRate.linearRampToValueAtTime(targetBpm / fromBpm, t3);
  }
}

/**
 * Schedule constant-volume transition for Auto-DJ mode.
 * @param {Object} nodesFrom - Audio nodes of the outgoing deck.
 * @param {Object} nodesTo - Audio nodes of the incoming deck.
 * @param {number} t0 - Transition start time.
 * @param {number} t3 - Transition end time.
 * @param {number} fromVolume - Current volume of the outgoing deck.
 */
export function scheduleAutoDjVolume(nodesFrom, nodesTo, t0, t3, fromVolume) {
  nodesTo.gainNode.gain.setValueAtTime(1.0, t0);
  nodesTo.gainNode.gain.setValueAtTime(1.0, t3);
  nodesFrom.gainNode.gain.setValueAtTime(fromVolume, t0);
  nodesFrom.gainNode.gain.setValueAtTime(fromVolume, t3);
}

/**
 * Reset the outgoing deck's EQ and gain to default flat values.
 * @param {Object} nodesFrom - Audio nodes of the outgoing deck.
 */
export function resetDeckEq(nodesFrom) {
  nodesFrom.lowShelf.gain.value = 0;
  nodesFrom.midPeaking.gain.value = 0;
  nodesFrom.highShelf.gain.value = 0;
  nodesFrom.gainNode.gain.value = 1.0;
}

/**
 * Phase detail metadata for UI display and logging.
 */
export const PHASE_DETAILS = {
  mid: { phase: 'mids', msg: "Mezclando frecuencias medias (Voces/Melodías)..." },
  low: { phase: 'lows', msg: "Intercambiando frecuencias bajas (Bassline Swap)..." },
  high: { phase: 'highs', msg: "Mezclando frecuencias altas (Hats/Groove)..." }
};
