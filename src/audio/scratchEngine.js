/**
 * Scratch Engine Module
 * Pure functions for vinyl scratch, pitch bend, and vinyl mode interactions.
 */

/**
 * Handle the start of a scratch or bend interaction.
 * @param {Object} nodes - The deck's audio node references.
 * @param {AudioContext} ctx - The Web Audio context.
 * @param {Object} deck - Current deck state { vinylMode, isPlaying, ... }.
 * @param {boolean} isUpperHalf - Whether the touch/click is on the upper half of the waveform.
 * @param {number} clientX - The X coordinate of the pointer event.
 * @param {Object} refs - Mutable refs { isScratchingRef, dragModeRef, lastXRef, lastTimeRef }.
 * @param {string} deckId - 'A' or 'B'.
 * @param {Function} playDeckSource - Function to start the deck source.
 * @returns {'scratch'|'bend'|null} The drag mode that was activated.
 */
export function handleScratchStart(nodes, ctx, deck, isUpperHalf, clientX, refs, deckId, playDeckSource) {
  if (!nodes.buffer) return null;

  if (deck.vinylMode && isUpperHalf) {
    refs.isScratchingRef.current[deckId] = true;
    refs.dragModeRef.current[deckId] = 'scratch';
    refs.lastXRef.current[deckId] = clientX;
    refs.lastTimeRef.current[deckId] = performance.now();

    if (!deck.isPlaying) {
      // Play deck source silently so it produces scratch sounds when dragged
      playDeckSource(deckId, 0, -100);
      if (nodes.source) {
        nodes.source.playbackRate.value = 0;
      }
    } else if (nodes.source) {
      try {
        nodes.source.playbackRate.setValueAtTime(nodes.source.playbackRate.value, ctx.currentTime);
        nodes.source.playbackRate.linearRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      } catch (e) {}
    }
    return 'scratch';
  } else {
    refs.dragModeRef.current[deckId] = 'bend';
    refs.lastXRef.current[deckId] = clientX;
    refs.lastTimeRef.current[deckId] = performance.now();
    return 'bend';
  }
}

/**
 * Handle scratch/bend movement update.
 * @param {Object} nodes - The deck's audio node references.
 * @param {AudioContext} ctx - The Web Audio context.
 * @param {Object} deck - Current deck state { currentTime, duration, ... }.
 * @param {number} clientX - The current X coordinate of the pointer.
 * @param {number} width - The width of the waveform element.
 * @param {Object} refs - Mutable refs.
 * @param {string} deckId - 'A' or 'B'.
 * @returns {{ newTime: number }|null} The new time position for scratch mode, or null.
 */
export function handleScratchUpdate(nodes, ctx, deck, clientX, width, refs, deckId) {
  if (!nodes.buffer || !nodes.source) return null;

  const dragMode = refs.dragModeRef.current[deckId];
  if (!dragMode) return null;

  const dx = clientX - refs.lastXRef.current[deckId];
  refs.lastXRef.current[deckId] = clientX;

  const now = performance.now();
  const dt = (now - refs.lastTimeRef.current[deckId]) / 1000;
  refs.lastTimeRef.current[deckId] = now;

  if (dragMode === 'scratch' && refs.isScratchingRef.current[deckId]) {
    if (dt > 0) {
      const velocity = (dx / width) * deck.duration;
      const dragSpeed = velocity / dt;

      const sensitivity = 1.2;
      let rate = dragSpeed * sensitivity;
      rate = Math.max(-4.0, Math.min(4.0, rate));

      if (Math.abs(rate) < 0.05) {
        rate = 0;
      }

      nodes.source.playbackRate.value = rate;

      const timeChange = (dx / width) * deck.duration;
      let newTime = deck.currentTime + timeChange;

      // Safety boundary to prevent backward crash
      newTime = Math.max(0.05, Math.min(deck.duration - 0.05, newTime));

      nodes.pausedAt = newTime;
      nodes.startTime = ctx.currentTime;

      return { newTime };
    }
  } else if (dragMode === 'bend') {
    const sensitivity = 0.5;
    const bendFactor = (dx / width) * sensitivity;
    const normalRate = 1 + (nodes.pitch / 100);
    let targetRate = normalRate + bendFactor;
    targetRate = Math.max(0.5, Math.min(1.5, targetRate));

    nodes.source.playbackRate.value = targetRate;

    // Schedule return to normal rate
    if (refs.bendTimeoutRef.current[deckId]) {
      clearTimeout(refs.bendTimeoutRef.current[deckId]);
    }
    refs.bendTimeoutRef.current[deckId] = setTimeout(() => {
      if (nodes.source && refs.dragModeRef.current[deckId] === 'bend') {
        nodes.source.playbackRate.value = normalRate;
      }
    }, 100);
  }

  return null;
}

/**
 * Handle the end of a scratch or bend interaction.
 * @param {Object} nodes - The deck's audio node references.
 * @param {AudioContext} ctx - The Web Audio context.
 * @param {Object} deck - Current deck state { isPlaying, ... }.
 * @param {boolean} isQuickClick - Whether this was a quick click (no drag).
 * @param {number} clickPercent - The click position as a percentage of waveform width.
 * @param {Object} refs - Mutable refs.
 * @param {string} deckId - 'A' or 'B'.
 * @param {Function} seekFn - Seek function: (deckId, percent) => void.
 * @param {Function} playDeckSource - Play function: (deckId) => void.
 * @param {Function} stopDeckSource - Stop function: (deckId) => void.
 */
export function handleScratchStop(nodes, ctx, deck, isQuickClick, clickPercent, refs, deckId, seekFn, playDeckSource, stopDeckSource) {
  if (!nodes.buffer) return;

  const dragMode = refs.dragModeRef.current[deckId];

  if (isQuickClick) {
    seekFn(deckId, clickPercent);
  } else {
    if (dragMode === 'scratch') {
      refs.isScratchingRef.current[deckId] = false;

      if (deck.isPlaying) {
        playDeckSource(deckId);
        if (nodes.source) {
          const normalRate = 1 + (nodes.pitch / 100);
          try {
            nodes.source.playbackRate.setValueAtTime(0.01, ctx.currentTime);
            nodes.source.playbackRate.linearRampToValueAtTime(normalRate, ctx.currentTime + 0.18);
          } catch (e) {}
        }
      } else {
        stopDeckSource(deckId);
      }
    } else if (dragMode === 'bend') {
      if (nodes.source) {
        const normalRate = 1 + (nodes.pitch / 100);
        nodes.source.playbackRate.value = normalRate;
      }
    }
  }

  refs.dragModeRef.current[deckId] = null;
  refs.isScratchingRef.current[deckId] = false;
  if (refs.bendTimeoutRef.current[deckId]) {
    clearTimeout(refs.bendTimeoutRef.current[deckId]);
    refs.bendTimeoutRef.current[deckId] = null;
  }
}
