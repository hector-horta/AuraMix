/**
 * Track Selection Module
 * Pure functions for finding compatible tracks and managing autoload timers.
 */

import { areKeysCompatible } from '../utils/audioAnalyzer';

/**
 * Find a compatible track from the library based on BPM and key compatibility.
 * @param {Object} currentTrack - The currently playing track.
 * @param {Array} library - Array of all available tracks.
 * @param {Array} playedTrackIds - Array of already-played track IDs.
 * @param {string} djMode - Current DJ mode ('manual', 'autodj', 'jukebox').
 * @param {string|null} excludeTrackId - Optional track ID to exclude (e.g. track currently sitting on target deck).
 * @returns {Object|null} A compatible track, or null if none found.
 */
export function findCompatibleTrack(currentTrack, library, playedTrackIds = [], djMode = 'autodj', excludeTrackId = null) {
  if (!currentTrack || !library || library.length === 0) return null;

  // Candidate pool excluding current active track and target deck's current track
  const availableTracks = library.filter(track => {
    if (track.id === currentTrack.id) return false;
    if (excludeTrackId && track.id === excludeTrackId) return false;
    return true;
  });

  if (availableTracks.length === 0) {
    if (excludeTrackId) {
      return findCompatibleTrack(currentTrack, library, playedTrackIds, djMode, null);
    }
    return null;
  }

  // Helper for BPM compatibility check (±5.0% in autodj mode, ignored in jukebox)
  const isBpmCompatible = (track) => {
    if (djMode === 'jukebox') return true;
    const bpmDiffPercent = Math.abs(track.bpm - currentTrack.bpm) / currentTrack.bpm;
    return bpmDiffPercent <= 0.05;
  };

  // 1. Unplayed + Key Compatible + BPM Compatible
  const unplayedKeyAndBpm = availableTracks.filter(track => {
    const isUnplayed = !playedTrackIds.includes(track.id);
    const keyMatch = areKeysCompatible(track.key, currentTrack.key);
    return isUnplayed && keyMatch && isBpmCompatible(track);
  });

  if (unplayedKeyAndBpm.length > 0) {
    return unplayedKeyAndBpm[0];
  }

  // 2. Unplayed + BPM Compatible (if key compatible tracks are exhausted and session is active)
  if (playedTrackIds.length > 0) {
    const unplayedBpmOnly = availableTracks.filter(track => {
      const isUnplayed = !playedTrackIds.includes(track.id);
      return isUnplayed && isBpmCompatible(track);
    });

    if (unplayedBpmOnly.length > 0) {
      return unplayedBpmOnly[0];
    }
  }

  // 3. Played + Key Compatible + BPM Compatible (oldest played first)
  const playedKeyAndBpm = availableTracks.filter(track => {
    const isPlayed = playedTrackIds.includes(track.id);
    const keyMatch = areKeysCompatible(track.key, currentTrack.key);
    return isPlayed && keyMatch && isBpmCompatible(track);
  });

  if (playedKeyAndBpm.length > 0) {
    playedKeyAndBpm.sort((a, b) => {
      const indexA = playedTrackIds.indexOf(a.id);
      const indexB = playedTrackIds.indexOf(b.id);
      return indexA - indexB;
    });
    return playedKeyAndBpm[0];
  }

  // 4. Played + BPM Compatible (oldest played first)
  const playedBpmOnly = availableTracks.filter(track => {
    const isPlayed = playedTrackIds.includes(track.id);
    return isPlayed && isBpmCompatible(track);
  });

  if (playedBpmOnly.length > 0) {
    playedBpmOnly.sort((a, b) => {
      const indexA = playedTrackIds.indexOf(a.id);
      const indexB = playedTrackIds.indexOf(b.id);
      return indexA - indexB;
    });
    return playedBpmOnly[0];
  }

  // 5. Retry without excludeTrackId if excludeTrackId prevented finding a track
  if (excludeTrackId) {
    return findCompatibleTrack(currentTrack, library, playedTrackIds, djMode, null);
  }

  return null;
}

/**
 * Creates an autoload scheduler that manages 10-second countdown timers per deck.
 * Emits tick events each second for UI countdown display.
 * @param {Function} findFn - Function to find a compatible track: (activeTrack, excludeId) => track|null
 * @param {Function} loadFn - Function to load a track into a deck: (track, deckId, startAuto, isAutoload) => boolean
 * @param {Function} addLog - Logging function.
 * @param {Object} callbacks - UI notification callbacks.
 * @param {Function} callbacks.onTick - Called every second: (deckId, secondsLeft) => void
 * @param {Function} callbacks.onAutoloaded - Called when a track is autoloaded: (deckId, track) => void
 * @param {Function} callbacks.onCancelled - Called when a countdown is cancelled: (deckId) => void
 * @returns {{ queue: Function, cancel: Function, cancelAll: Function, getTimers: Function }}
 */
export function createAutoloadScheduler(findFn, loadFn, addLog, callbacks = {}) {
  const timers = { A: null, B: null };
  const intervals = { A: null, B: null };
  const counters = { A: 0, B: 0 };

  const { onTick, onAutoloaded, onCancelled } = callbacks;

  /**
   * Queue a 10-second autoload countdown for a stopped deck.
   * @param {string} stoppedDeckId - 'A' or 'B'
   * @param {Object} currentActiveTrack - The track currently playing on the other deck.
   * @param {string} djMode - Current DJ mode.
   * @param {string|null} targetDeckCurrentTrackId - Optional track ID sitting on stopped deck to avoid re-loading.
   */
  function queue(stoppedDeckId, currentActiveTrack, djMode, targetDeckCurrentTrackId = null) {
    if (djMode === 'manual') return;

    // Clear any existing timer/interval for this deck
    clearDeck(stoppedDeckId);

    const modeLabel = djMode === 'jukebox' ? 'Jukebox' : 'Auto-DJ';
    addLog(`${modeLabel}: Cuenta regresiva de 10s para pre-cargar en Deck ${stoppedDeckId}...`);

    counters[stoppedDeckId] = 10;

    // Emit initial tick
    if (onTick) onTick(stoppedDeckId, 10);

    // Tick every second
    intervals[stoppedDeckId] = setInterval(() => {
      counters[stoppedDeckId] -= 1;
      const left = counters[stoppedDeckId];

      if (onTick) onTick(stoppedDeckId, left);

      if (left <= 0) {
        clearDeck(stoppedDeckId);

        const compatibleTrack = targetDeckCurrentTrackId !== null
          ? findFn(currentActiveTrack, targetDeckCurrentTrackId)
          : findFn(currentActiveTrack);

        if (compatibleTrack) {
          addLog(`${modeLabel}: Cargando automáticamente "${compatibleTrack.title}" en Deck ${stoppedDeckId}.`);
          const success = loadFn(compatibleTrack, stoppedDeckId, false, true);
          if (success !== false && onAutoloaded) {
            onAutoloaded(stoppedDeckId, compatibleTrack);
          }
        } else {
          addLog(`${modeLabel}: No se encontró tema compatible para pre-cargar en Deck ${stoppedDeckId}.`);
          if (onTick) onTick(stoppedDeckId, null); // signal end without load
        }
      }
    }, 1000);
  }

  function clearDeck(deckId) {
    if (intervals[deckId]) {
      clearInterval(intervals[deckId]);
      intervals[deckId] = null;
    }
    if (timers[deckId]) {
      clearTimeout(timers[deckId]);
      timers[deckId] = null;
    }
    counters[deckId] = 0;
  }

  /**
   * Cancel an autoload timer for a specific deck.
   * @param {string} deckId - 'A' or 'B'
   */
  function cancel(deckId) {
    const wasActive = intervals[deckId] !== null;
    clearDeck(deckId);
    if (wasActive && onCancelled) {
      onCancelled(deckId);
    }
  }

  /**
   * Cancel all autoload timers.
   */
  function cancelAll() {
    cancel('A');
    cancel('B');
  }

  /**
   * Get current timer state (for testing).
   * @returns {{ A: number|null, B: number|null }}
   */
  function getTimers() {
    return { A: intervals.A ? counters.A : null, B: intervals.B ? counters.B : null };
  }

  return { queue, cancel, cancelAll, getTimers };
}
