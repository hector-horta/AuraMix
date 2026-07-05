import { useState, useEffect, useRef } from 'react';

/**
 * Custom Hook: useSessionTimer
 * Tracks total session elapsed time (in seconds) while any deck is actively playing.
 */
export function useSessionTimer(isPlayingA, isPlayingB) {
  const [sessionElapsedTime, setSessionElapsedTime] = useState(0);
  const elapsedAccumulatorRef = useRef(0);

  useEffect(() => {
    if (!isPlayingA && !isPlayingB) {
      return;
    }

    const intervalId = setInterval(() => {
      elapsedAccumulatorRef.current += 1;
      setSessionElapsedTime(elapsedAccumulatorRef.current);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isPlayingA, isPlayingB]);

  return { sessionElapsedTime };
}
