import { useEffect } from 'react';

/**
 * Custom Hook: useDeckPlayback
 * Manages the high-resolution requestAnimationFrame playback timer loop
 * and triggers time update / end of track callbacks.
 */
export function useDeckPlayback({
  deckId,
  audioCtxRef,
  isPlaying,
  duration,
  nodesRef,
  isScratchingRef,
  setDeck,
  onPlaybackEnded,
  onTimeUpdate
}) {
  useEffect(() => {
    let frameId;

    const updateProgress = () => {
      const ctx = audioCtxRef.current;
      if (!ctx || !isPlaying) return;

      // Skip progress updates while scratching to prevent playhead jitter
      if (isScratchingRef.current) {
        frameId = requestAnimationFrame(updateProgress);
        return;
      }

      const elapsed = Math.max(0, ctx.currentTime - nodesRef.current.startTime);
      const playbackRate = 1 + (nodesRef.current.pitch / 100);
      let current = nodesRef.current.pausedAt + elapsed * playbackRate;

      // Handle beat loop wrapping
      if (nodesRef.current.loopActive) {
        const loopDuration = nodesRef.current.loopEnd - nodesRef.current.loopStart;
        if (current >= nodesRef.current.loopEnd && loopDuration > 0) {
          const timeInLoop = (current - nodesRef.current.loopStart) % loopDuration;
          current = nodesRef.current.loopStart + timeInLoop;
        }
      }

      if (current >= duration && duration > 0) {
        onPlaybackEnded(deckId);
      } else {
        setDeck(prev => ({ ...prev, currentTime: current }));
        if (onTimeUpdate) {
          onTimeUpdate(deckId, current);
        }
      }

      frameId = requestAnimationFrame(updateProgress);
    };

    if (isPlaying && duration > 0) {
      frameId = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isPlaying, duration, deckId, audioCtxRef, nodesRef, isScratchingRef, setDeck, onPlaybackEnded, onTimeUpdate]);
}
