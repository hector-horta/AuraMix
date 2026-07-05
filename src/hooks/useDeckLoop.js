import { useCallback } from 'react';
import { formatTime } from '../utils/formatTime';

/**
 * Custom Hook: useDeckLoop
 * Handles beat grid loop calculations, activation, deactivation, and resizing.
 */
export function useDeckLoop({
  deckId,
  audioCtxRef,
  nodesRef,
  deck,
  setDeck,
  initAudio,
  playDeckSource,
  addLog
}) {
  const toggleDeckLoop = useCallback((bars) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const nodes = nodesRef.current;
    if (!deck.track || !nodes.buffer) return;

    const bpm = deck.track.bpm || 120;
    const firstBeatOffset = deck.track.firstBeatOffset || 0;
    const beatDuration = 60 / bpm;
    const barDuration = 4 * beatDuration;
    const loopDuration = bars * barDuration;

    if (nodes.loopActive && nodes.activeLoopBars === bars) {
      // Deactivate loop
      nodes.loopActive = false;
      nodes.activeLoopBars = null;
      nodes.loopStart = 0;
      nodes.loopEnd = 0;

      if (nodes.source) {
        nodes.source.loop = false;
      }
      setDeck(prev => ({ ...prev, activeLoopBars: null, loopStart: 0, loopEnd: 0 }));
      addLog(`Deck ${deckId}: Loop desactivado.`);
    } else if (nodes.loopActive) {
      // Resize existing loop
      const newLoopEnd = Math.min(deck.duration, nodes.loopStart + loopDuration);
      nodes.activeLoopBars = bars;
      nodes.loopEnd = newLoopEnd;

      if (nodes.source) {
        nodes.source.loopEnd = newLoopEnd;
      }

      if (nodes.source && deck.isPlaying) {
        const playbackRate = 1 + (nodes.pitch / 100);
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const current = nodes.pausedAt + elapsed * playbackRate;
        if (current > newLoopEnd) {
          const newLoopDuration = newLoopEnd - nodes.loopStart;
          const timeInLoop = (current - nodes.loopStart) % newLoopDuration;
          nodes.pausedAt = nodes.loopStart + timeInLoop;
          playDeckSource();
        }
      }

      setDeck(prev => ({ ...prev, activeLoopBars: bars, loopEnd: newLoopEnd }));
      addLog(`Deck ${deckId}: Loop redimensionado a ${bars} barras (${formatTime(nodes.loopStart)} - ${formatTime(newLoopEnd)}).`);
    } else {
      // Activate new loop
      const elapsed = Math.max(0, deck.currentTime - firstBeatOffset);
      const nearestBeat = Math.round(elapsed / beatDuration);
      const loopStart = Math.max(0, firstBeatOffset + nearestBeat * beatDuration);
      const loopEnd = Math.min(deck.duration, loopStart + loopDuration);

      nodes.loopActive = true;
      nodes.activeLoopBars = bars;
      nodes.loopStart = loopStart;
      nodes.loopEnd = loopEnd;

      if (nodes.source) {
        nodes.source.loop = true;
        nodes.source.loopStart = loopStart;
        nodes.source.loopEnd = loopEnd;
      }
      setDeck(prev => ({ ...prev, activeLoopBars: bars, loopStart: loopStart, loopEnd: loopEnd }));
      addLog(`Deck ${deckId}: Loop activado de ${bars} barras (${formatTime(loopStart)} - ${formatTime(loopEnd)}).`);
    }
  }, [deck, deckId, audioCtxRef, nodesRef, setDeck, initAudio, playDeckSource, addLog]);

  return { toggleDeckLoop };
}
