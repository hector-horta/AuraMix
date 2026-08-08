import { useState, useRef, useCallback } from 'react';
import { createAutoloadScheduler } from '../audio/trackSelection';

/**
 * Custom Hook: useAutoloadManager
 * Manages 10-second autoload countdown timers per deck and toast notifications.
 */
export function useAutoloadManager({ addLog }) {
  const [autoloadCountdown, setAutoloadCountdown] = useState({ A: null, B: null });
  const [autoloadNotification, setAutoloadNotification] = useState(null);
  const autoloadSchedulerRef = useRef(null);
  const findFnRef = useRef(null);
  const loadFnRef = useRef(null);

  const getAutoloadScheduler = useCallback((findCompatibleTrackFn, loadTrackIntoDeckFn) => {
    // Always keep the latest functions so the scheduler never uses stale closures
    findFnRef.current = findCompatibleTrackFn;
    loadFnRef.current = loadTrackIntoDeckFn;

    if (!autoloadSchedulerRef.current) {
      autoloadSchedulerRef.current = createAutoloadScheduler(
        (...args) => findFnRef.current(...args),
        (...args) => loadFnRef.current(...args),
        addLog,
        {
          onTick: (deckId, secondsLeft) => {
            setAutoloadCountdown(prev => ({ ...prev, [deckId]: secondsLeft }));
          },
          onAutoloaded: (deckId, track) => {
            setAutoloadCountdown(prev => ({ ...prev, [deckId]: null }));
            setAutoloadNotification({ deckId, track, timestamp: Date.now() });
          },
          onCancelled: (deckId) => {
            setAutoloadCountdown(prev => ({ ...prev, [deckId]: null }));
          }
        }
      );
    }
    return autoloadSchedulerRef.current;
  }, [addLog]);

  const cancelAutoload = useCallback((deckId) => {
    if (autoloadSchedulerRef.current) {
      autoloadSchedulerRef.current.cancel(deckId);
    }
  }, []);

  const cancelAllAutoloads = useCallback(() => {
    if (autoloadSchedulerRef.current) {
      autoloadSchedulerRef.current.cancelAll();
    }
  }, []);

  const dismissAutoloadNotification = useCallback(() => {
    setAutoloadNotification(null);
  }, []);

  return {
    autoloadCountdown,
    autoloadNotification,
    getAutoloadScheduler,
    cancelAutoload,
    cancelAllAutoloads,
    dismissAutoloadNotification
  };
}
