import { useState, useRef, useEffect, useCallback } from 'react';
import {
  calculateBeatAlignment,
  calculateTransitionTiming,
  scheduleEqTransition,
  scheduleJukeboxTransition,
  scheduleAutoDjVolume,
  resetDeckEq,
  PHASE_DETAILS,
  scheduleEqualPowerCrossfade,
  scheduleBasslineSwap
} from '../audio/transitionEngine';

/**
 * Custom Hook: useTransitionController
 * Manages automated transitions (Auto-DJ EQ Ramp, Bassline Swap, and Jukebox crossfades).
 */
export function useTransitionController({
  audioCtxRef,
  deckA,
  deckB,
  masterBpm,
  changeMasterBpm,
  djModeRef,
  autoDjStyle,
  eqOrder,
  addLog,
  setActiveDeckId,
  getAutoloadScheduler,
  findCompatibleTrack
}) {
  const [transitionState, setTransitionState] = useState({
    active: false,
    phase: 'idle',
    progress: 0
  });

  const transitionActiveRef = useRef(false);
  const transitionCheckedRef = useRef({ A: false, B: false });
  const transitionTimeoutsRef = useRef([]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      transitionTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const resetCheckedState = useCallback((deckId, targetTime, outroTime) => {
    if (targetTime < outroTime) {
      transitionCheckedRef.current[deckId] = false;
    }
  }, []);

  const triggerAutomatedTransition = useCallback((fromDeckId, toDeckId, incomingTrack, loadTrackIntoDeckFn) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    transitionTimeoutsRef.current.forEach(clearTimeout);
    transitionTimeoutsRef.current = [];

    transitionActiveRef.current = true;
    setTransitionState({
      active: true,
      phase: 'aligning',
      progress: 0
    });

    const currentDjMode = djModeRef.current;
    const fromDeckInst = fromDeckId === 'A' ? deckA : deckB;
    const toDeckInst = toDeckId === 'A' ? deckA : deckB;

    const currentDeck = fromDeckInst.state;
    const targetDeck = toDeckInst.state;

    addLog(`Iniciando mezcla automática: Deck ${fromDeckId} ➔ Deck ${toDeckId}`);
    
    const nodesFrom = fromDeckInst.nodes;
    const nodesTo = toDeckInst.nodes;

    const targetTrack = incomingTrack || targetDeck.track;
    
    const cuePoint = (currentDjMode !== 'jukebox' && targetTrack) ? (targetTrack.cue || 0) : 0;
    nodesTo.pausedAt = cuePoint;
    
    toDeckInst.setState(prev => ({ ...prev, currentTime: cuePoint }));
    
    const pitchOffset = currentDjMode === 'jukebox' ? 0 : (targetTrack ? (((masterBpm - targetTrack.bpm) / targetTrack.bpm) * 100) : 0);
    nodesTo.pitch = pitchOffset;
    toDeckInst.setState(prev => ({ ...prev, pitch: pitchOffset }));
    if (nodesTo.source) {
      nodesTo.source.playbackRate.value = 1 + (pitchOffset / 100);
    }
    
    if (currentDjMode === 'jukebox') {
      addLog(`Alineando tempo (Modo Jukebox): Deck ${toDeckId} a velocidad original (${targetTrack?.bpm} BPM)`);
      nodesTo.lowShelf.gain.value = 0;
      nodesTo.midPeaking.gain.value = 0;
      nodesTo.highShelf.gain.value = 0;
      toDeckInst.setState(prev => ({ ...prev, eq: { low: 0, mid: 0, high: 0 } }));
    } else {
      addLog(`Alineando tempo: Sincronizando Deck ${toDeckId} a ${masterBpm} BPM (${pitchOffset > 0 ? '+' : ''}${pitchOffset.toFixed(2)}% de velocidad)`);
      nodesTo.lowShelf.gain.value = -40;
      nodesTo.midPeaking.gain.value = -40;
      nodesTo.highShelf.gain.value = -40;
      toDeckInst.setState(prev => ({ ...prev, eq: { low: -40, mid: -40, high: -40 } }));
    }

    // --- BEAT GRID ALIGNMENT ---
    const activeTrack = currentDeck.track;
    const pitchFrom = currentDeck.pitch;
    const pausedAtTo = nodesTo.pausedAt || 0.0;

    const { startTime, delay, highPrecisionTime } = calculateBeatAlignment(
      ctx, nodesFrom, activeTrack, pitchFrom, targetTrack, pitchOffset, pausedAtTo, masterBpm
    );

    toDeckInst.playDeckSource(startTime, pitchOffset);
    toDeckInst.setState(prev => ({ ...prev, isPlaying: true }));
    nodesTo.pausedAt = cuePoint;

    const calculatedDelay = startTime - ctx.currentTime;
    addLog(`Alineación rítmica: Lanzando Deck ${toDeckId} (primer golpe a +${(calculatedDelay * 1000).toFixed(0)}ms)`);

    // --- TRANSITION TIMING ---
    const currentDeckDuration = currentDeck.duration;
    const outroTimeFrom = currentDeck.outroTime;
    const introTimeVal = targetTrack ? targetTrack.intro : 90;
    const fromDeckVolume = currentDeck.volume;

    const introDurationVal = Math.max(0, introTimeVal - cuePoint);

    const timing = calculateTransitionTiming(
      currentDeckDuration, outroTimeFrom, introDurationVal, highPrecisionTime, delay, startTime, currentDjMode
    );

    const { transitionDuration, phaseDuration, t0, t1, t2, t3 } = timing;
    
    addLog(`Duración de mezcla: ${transitionDuration.toFixed(1)}s (outro saliente: ${timing.outroDuration.toFixed(1)}s, intro entrante: ${timing.introDuration.toFixed(1)}s) — 3 fases de ${phaseDuration.toFixed(1)}s.`);

    toDeckInst.setState(prev => ({ ...prev, volume: 1.0, isUserSelected: false }));

    // --- SCHEDULE AUDIO RAMPS ---
    const fromBpm = activeTrack ? activeTrack.bpm : 120;
    const playbackRateFrom = 1 + (pitchFrom / 100);

    if (currentDjMode === 'jukebox') {
      scheduleJukeboxTransition(nodesFrom, nodesTo, t0, t3, fromDeckVolume, targetTrack?.bpm, fromBpm, playbackRateFrom);
    } else if (autoDjStyle === 'bass') {
      scheduleEqualPowerCrossfade(nodesFrom, nodesTo, t0, t3, fromDeckVolume);
      const fromEq = currentDeck.eq;
      scheduleBasslineSwap(nodesFrom, nodesTo, t0, t3, fromEq);
    } else {
      scheduleAutoDjVolume(nodesFrom, nodesTo, t0, t3, fromDeckVolume);
      const fromEq = currentDeck.eq;
      scheduleEqTransition(nodesFrom, nodesTo, eqOrder, [t0, t1, t2, t3], fromEq);
    }

    // --- SCHEDULE UI/STATE UPDATES ---
    const scheduler = getAutoloadScheduler(findCompatibleTrack, loadTrackIntoDeckFn);

    const scheduleTransitionCompletion = (completionTime, isJukebox) => {
      const tId = setTimeout(() => {
        setTransitionState({ active: false, phase: 'idle', progress: 0 });
        transitionActiveRef.current = false;
        setActiveDeckId(toDeckId);
        
        fromDeckInst.stopDeckSource();
        fromDeckInst.setState(prev => ({
          ...prev,
          isPlaying: false,
          currentTime: 0,
          eq: { low: 0, mid: 0, high: 0 },
          volume: 1.0,
          isUserSelected: false,
          lastPlayedTrackId: prev.track ? prev.track.id : prev.lastPlayedTrackId
        }));
        resetDeckEq(nodesFrom);

        toDeckInst.setState(prev => ({ ...prev, eq: { low: 0, mid: 0, high: 0 } }));

        if (isJukebox && targetTrack) {
          changeMasterBpm(targetTrack.bpm);
          addLog(`¡Mezcla Jukebox completada! Deck ${toDeckId} ahora en vivo a ${targetTrack?.bpm} BPM.`);
        } else {
          addLog(`¡Mezcla completada! Deck ${toDeckId} ahora en vivo tras el DROP.`);
        }
        scheduler.queue(fromDeckId, targetTrack, djModeRef.current);
      }, completionTime * 1000);
      
      transitionTimeoutsRef.current.push(tId);
    };

    if (currentDjMode === 'jukebox') {
      const tId1 = setTimeout(() => {
        setTransitionState(prev => ({ ...prev, phase: 'crossfade', progress: 10 }));
        addLog(`Transición Jukebox: Iniciando Crossfade y rampa de tempo hacia ${targetTrack?.bpm} BPM...`);
      }, delay * 1000);
      transitionTimeoutsRef.current.push(tId1);

      const tId2 = setTimeout(() => {
        setTransitionState(prev => ({ ...prev, progress: 50 }));
      }, (delay + transitionDuration / 2) * 1000);
      transitionTimeoutsRef.current.push(tId2);

      const tId3 = setTimeout(() => {
        setTransitionState(prev => ({ ...prev, progress: 90 }));
      }, (delay + transitionDuration * 0.9) * 1000);
      transitionTimeoutsRef.current.push(tId3);

      scheduleTransitionCompletion(delay + transitionDuration, true);
    } else if (autoDjStyle === 'bass') {
      const tId1 = setTimeout(() => {
        setTransitionState(prev => ({ ...prev, phase: 'crossfade', progress: 15 }));
        addLog(`Transición Bassline Swap: Mezclando melodías con curva de potencia constante...`);
      }, delay * 1000);
      transitionTimeoutsRef.current.push(tId1);

      const tId2 = setTimeout(() => {
        setTransitionState(prev => ({ ...prev, phase: 'lows', progress: 50 }));
        addLog(`¡BASSLINE SWAP! Intercambiando frecuencias bajas en el compás.`);
      }, (delay + transitionDuration / 2) * 1000);
      transitionTimeoutsRef.current.push(tId2);

      const tId3 = setTimeout(() => {
        setTransitionState(prev => ({ ...prev, progress: 85 }));
      }, (delay + transitionDuration * 0.85) * 1000);
      transitionTimeoutsRef.current.push(tId3);

      scheduleTransitionCompletion(delay + transitionDuration, false);
    } else {
      const tId1 = setTimeout(() => {
        const b = eqOrder[0];
        setTransitionState(prev => ({ ...prev, phase: PHASE_DETAILS[b].phase, progress: 15 }));
        addLog(`Transición [1/3]: ${PHASE_DETAILS[b].msg}`);
      }, delay * 1000);
      transitionTimeoutsRef.current.push(tId1);

      const tId2 = setTimeout(() => {
        const b = eqOrder[1];
        setTransitionState(prev => ({ ...prev, phase: PHASE_DETAILS[b].phase, progress: 50 }));
        addLog(`Transición [2/3]: ${PHASE_DETAILS[b].msg}`);
      }, (delay + phaseDuration) * 1000);
      transitionTimeoutsRef.current.push(tId2);

      const tId3 = setTimeout(() => {
        const b = eqOrder[2];
        setTransitionState(prev => ({ ...prev, phase: PHASE_DETAILS[b].phase, progress: 85 }));
        addLog(`Transición [3/3]: ${PHASE_DETAILS[b].msg}`);
      }, (delay + 2 * phaseDuration) * 1000);
      transitionTimeoutsRef.current.push(tId3);

      scheduleTransitionCompletion(delay + 3 * phaseDuration, false);
    }
  }, [audioCtxRef, deckA, deckB, masterBpm, changeMasterBpm, djModeRef, autoDjStyle, eqOrder, addLog, setActiveDeckId, getAutoloadScheduler, findCompatibleTrack]);

  const checkAutoDjTransition = useCallback((playingDeckId, currentTime, loadTrackIntoDeckFn) => {
    const currentDjMode = djModeRef.current;
    const isAutoDjActive = currentDjMode !== 'manual';
    if (!isAutoDjActive || transitionState.active || transitionActiveRef.current) return;
    if (transitionCheckedRef.current[playingDeckId]) return;

    const currentDeck = playingDeckId === 'A' ? deckA.state : deckB.state;
    const targetDeckId = playingDeckId === 'A' ? 'B' : 'A';
    const targetDeck = targetDeckId === 'A' ? deckA.state : deckB.state;

    const triggerTime = currentDjMode === 'jukebox'
      ? Math.max(0, currentDeck.duration - 15)
      : currentDeck.outroTime;
    
    if (currentTime >= triggerTime && currentTime < currentDeck.duration - 2) {
      transitionCheckedRef.current[playingDeckId] = true;
      if (currentDjMode === 'jukebox') {
        addLog(`Jukebox: ¡Punto de transición alcanzado en Deck ${playingDeckId} (${triggerTime.toFixed(1)}s, 15s antes del final)!`);
      } else {
        addLog(`Auto-DJ: ¡Punto Outro alcanzado en Deck ${playingDeckId} (${triggerTime.toFixed(1)}s)!`);
      }
      
      if (targetDeck.track) {
        if (currentDjMode === 'jukebox') {
          addLog(`Jukebox: Usando canción cargada manualmente "${targetDeck.track.title}" en Deck ${targetDeckId} para la mezcla.`);
        } else {
          addLog(`Auto-DJ: Usando canción cargada manualmente "${targetDeck.track.title}" en Deck ${targetDeckId} para la mezcla.`);
        }
        triggerAutomatedTransition(playingDeckId, targetDeckId, targetDeck.track, loadTrackIntoDeckFn);
      } else {
        const compatibleTrack = findCompatibleTrack(currentDeck.track);
        
        if (compatibleTrack) {
          if (currentDjMode === 'jukebox') {
            addLog(`Jukebox: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
          } else {
            addLog(`Auto-DJ: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
          }
          loadTrackIntoDeckFn(compatibleTrack, targetDeckId, true, true);
        } else {
          if (currentDjMode === 'jukebox') {
            addLog(`Jukebox Advertencia: No hay canciones en la biblioteca para mezclar automáticamente.`);
          } else {
            addLog(`Auto-DJ Advertencia: No hay canciones compatibles en la biblioteca (BPM ±5.0% y Camelot Key compatible) para mezclar automáticamente.`);
          }
        }
      }
    }
  }, [djModeRef, transitionState.active, deckA.state, deckB.state, addLog, triggerAutomatedTransition, findCompatibleTrack]);

  return {
    transitionState,
    transitionActiveRef,
    transitionCheckedRef,
    resetCheckedState,
    triggerAutomatedTransition,
    checkAutoDjTransition
  };
}
