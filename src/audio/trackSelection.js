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
 * Creates an autoload scheduler that manages 10-second prep timers per deck.
 * @param {Function} findFn - Function to find a compatible track: (activeTrack) => track|null
 * @param {Function} loadFn - Function to load a track into a deck: (track, deckId, startAuto, isAutoload) => void
 * @param {Function} addLog - Logging function.
 * @returns {{ queue: Function, cancel: Function, cancelAll: Function, getTimers: Function }}
 */
export function createAutoloadScheduler(findFn, loadFn, addLog) {
  const timers = { A: null, B: null };

  /**
   * Queue a 10-second autoload timer for a stopped deck.
   * @param {string} stoppedDeckId - 'A' or 'B'
   * @param {Object} currentActiveTrack - The track currently playing on the other deck.
   * @param {string} djMode - Current DJ mode.
   */
  function queue(stoppedDeckId, currentActiveTrack, djMode) {
    if (djMode === 'manual') return;

    // Clear any existing timer for this deck
    if (timers[stoppedDeckId]) {
      clearTimeout(timers[stoppedDeckId]);
    }

    addLog(`Auto-DJ: Esperando 10 segundos para pre-cargar canción compatible en Deck ${stoppedDeckId}...`);

    timers[stoppedDeckId] = setTimeout(() => {
      const compatibleTrack = findFn(currentActiveTrack);
      if (compatibleTrack) {
        addLog(`Auto-DJ (10s): Cargando automáticamente tema preparado "${compatibleTrack.title}" en Deck ${stoppedDeckId}.`);
        loadFn(compatibleTrack, stoppedDeckId, false, true);
      } else {
        addLog(`Auto-DJ (10s) Info: No se encontró tema compatible en la biblioteca para pre-cargar en Deck ${stoppedDeckId}.`);
      }
      timers[stoppedDeckId] = null;
    }, 10000);
  }

  /**
   * Cancel an autoload timer for a specific deck.
   * @param {string} deckId - 'A' or 'B'
   */
  function cancel(deckId) {
    if (timers[deckId]) {
      clearTimeout(timers[deckId]);
      timers[deckId] = null;
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
    return { ...timers };
  }

  return { queue, cancel, cancelAll, getTimers };
}
