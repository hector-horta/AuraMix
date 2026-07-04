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
 * @returns {Object|null} A compatible track, or null if none found.
 */
export function findCompatibleTrack(currentTrack, library, playedTrackIds, djMode) {
  if (!currentTrack) return null;

  // Get all compatible tracks (matching key & BPM within 5%)
  const compatibleTracks = library.filter(track => {
    // Exclude current track
    if (track.id === currentTrack.id) return false;

    const bpmDiffPercent = Math.abs(track.bpm - currentTrack.bpm) / currentTrack.bpm;
    const bpmCompatible = djMode === 'jukebox' ? true : (bpmDiffPercent <= 0.05);
    const keyCompatible = areKeysCompatible(track.key, currentTrack.key);

    return bpmCompatible && keyCompatible;
  });

  const playedRatio = library.length > 0 ? playedTrackIds.length / library.length : 0;

  const unplayedCandidates = compatibleTracks.filter(track => !playedTrackIds.includes(track.id));
  const playedCandidates = compatibleTracks.filter(track => playedTrackIds.includes(track.id));

  if (unplayedCandidates.length > 0) {
    return unplayedCandidates[0];
  }

  // Fallback to played tracks if >= 75% of the library has been played
  if (playedRatio >= 0.75 && playedCandidates.length > 0) {
    // Sort played candidates by their appearance in playedTrackIds (oldest played first)
    playedCandidates.sort((a, b) => {
      const indexA = playedTrackIds.indexOf(a.id);
      const indexB = playedTrackIds.indexOf(b.id);
      return indexA - indexB;
    });
    return playedCandidates[0];
  }

  return null;
}

/**
 * Creates an autoload scheduler that manages 10-second countdown timers per deck.
 * Emits tick events each second for UI countdown display.
 * @param {Function} findFn - Function to find a compatible track: (activeTrack) => track|null
 * @param {Function} loadFn - Function to load a track into a deck: (track, deckId, startAuto, isAutoload) => void
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
   */
  function queue(stoppedDeckId, currentActiveTrack, djMode) {
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

        const compatibleTrack = findFn(currentActiveTrack);
        if (compatibleTrack) {
          addLog(`${modeLabel}: Cargando automáticamente "${compatibleTrack.title}" en Deck ${stoppedDeckId}.`);
          loadFn(compatibleTrack, stoppedDeckId, false, true);
          if (onAutoloaded) onAutoloaded(stoppedDeckId, compatibleTrack);
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
