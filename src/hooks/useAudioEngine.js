import { useState, useEffect, useRef } from 'react'
import { findCompatibleTrack as findCompatible, createAutoloadScheduler } from '../audio/trackSelection'
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
} from '../audio/transitionEngine'
import { updateFx as applyFx } from '../audio/fxEngine'
import { useAudioDeck } from './useAudioDeck'

export function useAudioEngine({ library, addLog, onUpdateTrackCuePoints }) {
  const [djMode, setDjMode] = useState('autodj'); // 'manual', 'autodj', 'jukebox'
  const autoDj = djMode !== 'manual';
  const [autoDjStyle, setAutoDjStyle] = useState('eq'); // 'eq' or 'bass'
  const [eqOrder, setEqOrder] = useState(['mid', 'low', 'high']);
  const [playedTrackIds, setPlayedTrackIds] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState('A'); // 'A' or 'B'
  const [masterBpm, setMasterBpm] = useState(128);
  const [transitionState, setTransitionState] = useState({
    active: false,
    phase: 'idle', // 'idle', 'aligning', 'volume', 'mids', 'highs', 'lows', 'boost'
    progress: 0
  });

  const [sessionElapsedTime, setSessionElapsedTime] = useState(0);
  const [fxState, setFxState] = useState({
    active: false,
    type: 'Filter',
    x: 0.5,
    y: 0.5
  });

  // Refs for transitions and scheduling stability
  const transitionActiveRef = useRef(false);
  const transitionCheckedRef = useRef({ A: false, B: false });
  const transitionTimeoutsRef = useRef([]);
  const elapsedAccumulatorRef = useRef(0);

  const libraryRef = useRef(library);
  const playedTrackIdsRef = useRef(playedTrackIds);
  const djModeRef = useRef(djMode);
  const masterBpmRef = useRef(masterBpm);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    playedTrackIdsRef.current = playedTrackIds;
  }, [playedTrackIds]);

  useEffect(() => {
    masterBpmRef.current = masterBpm;
  }, [masterBpm]);

  useEffect(() => {
    djModeRef.current = djMode;
  }, [djMode]);

  // Audio Context Ref
  const audioCtxRef = useRef(null);

  // Instantiating both decks
  const deckA = useAudioDeck({
    deckId: 'A',
    audioCtxRef,
    initAudio,
    addLog,
    onPlaybackEnded: (id) => handlePlaybackEnded(id),
    onTimeUpdate: (id, time) => checkAutoDjTransition(id, time),
    onSetActiveDeck: (id) => setActiveDeckId(id),
    onSeekMarkerCheck: (id, targetTime) => {
      const deckState = id === 'A' ? deckARef.current : deckBRef.current;
      if (deckState && targetTime < deckState.outroTime) {
        transitionCheckedRef.current[id] = false;
      }
    },
    onOutroCueChanged: (id, validatedTime) => {
      const deckState = id === 'A' ? deckARef.current : deckBRef.current;
      if (deckState && deckState.currentTime < validatedTime) {
        transitionCheckedRef.current[id] = false;
      }
    },
    onUpdateTrackCuePoints
  });

  const deckB = useAudioDeck({
    deckId: 'B',
    audioCtxRef,
    initAudio,
    addLog,
    onPlaybackEnded: (id) => handlePlaybackEnded(id),
    onTimeUpdate: (id, time) => checkAutoDjTransition(id, time),
    onSetActiveDeck: (id) => setActiveDeckId(id),
    onSeekMarkerCheck: (id, targetTime) => {
      const deckState = id === 'A' ? deckARef.current : deckBRef.current;
      if (deckState && targetTime < deckState.outroTime) {
        transitionCheckedRef.current[id] = false;
      }
    },
    onOutroCueChanged: (id, validatedTime) => {
      const deckState = id === 'A' ? deckARef.current : deckBRef.current;
      if (deckState && deckState.currentTime < validatedTime) {
        transitionCheckedRef.current[id] = false;
      }
    },
    onUpdateTrackCuePoints
  });

  const deckARef = useRef(deckA.state);
  const deckBRef = useRef(deckB.state);

  useEffect(() => {
    deckARef.current = deckA.state;
    deckBRef.current = deckB.state;
  }, [deckA.state, deckB.state]);

  // Retrieve deck nodes helper
  const getNodes = (deckId) => {
    return deckId === 'A' ? deckA.nodes : deckB.nodes;
  };

  // --- Autoload Scheduler ---
  const autoloadSchedulerRef = useRef(null);

  const findCompatibleTrack = (currentTrack) => {
    return findCompatible(currentTrack, libraryRef.current, playedTrackIdsRef.current, djModeRef.current);
  };

  const getAutoloadScheduler = () => {
    if (!autoloadSchedulerRef.current) {
      autoloadSchedulerRef.current = createAutoloadScheduler(
        findCompatibleTrack,
        loadTrackIntoDeck,
        addLog
      );
    }
    return autoloadSchedulerRef.current;
  };

  useEffect(() => {
    if (djMode === 'manual') {
      if (autoloadSchedulerRef.current) {
        autoloadSchedulerRef.current.cancelAll();
      }
    } else if (djMode === 'jukebox') {
      deckA.updatePitch(0);
      deckB.updatePitch(0);
      
      const currentActiveDeck = activeDeckId === 'A' ? deckA.state : deckB.state;
      if (currentActiveDeck && currentActiveDeck.track) {
        setMasterBpm(currentActiveDeck.track.bpm);
      }
    } else if (djMode === 'autodj') {
      const currentMasterBpm = masterBpmRef.current;
      if (deckA.state.track) {
        const pitchVal = ((currentMasterBpm - deckA.state.track.bpm) / deckA.state.track.bpm) * 100;
        deckA.updatePitch(pitchVal);
      }
      if (deckB.state.track) {
        const pitchVal = ((currentMasterBpm - deckB.state.track.bpm) / deckB.state.track.bpm) * 100;
        deckB.updatePitch(pitchVal);
      }
    }
  }, [djMode]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      transitionTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // --- INITIALIZE AUDIO CONTEXT ---
  function initAudio() {
    if (audioCtxRef.current) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    
    deckA.init(ctx);
    deckB.init(ctx);

    addLog("Web Audio Engine inicializado correctamente.");
  }

  const changeMasterBpm = (newBpm) => {
    setMasterBpm(newBpm);
    
    if (djModeRef.current === 'jukebox') {
      return;
    }
    
    if (deckA.state.track) {
      const originalBpm = deckA.state.track.bpm;
      const pitchOffset = ((newBpm - originalBpm) / originalBpm) * 100;
      deckA.updatePitch(pitchOffset);
    }

    if (deckB.state.track) {
      const originalBpm = deckB.state.track.bpm;
      const pitchOffset = ((newBpm - originalBpm) / originalBpm) * 100;
      deckB.updatePitch(pitchOffset);
    }
  };

  const handlePlaybackEnded = (deckId) => {
    addLog(`Deck ${deckId}: Canción finalizada.`);
    const nodes = getNodes(deckId);
    nodes.loopActive = false;
    nodes.activeLoopBars = null;
    nodes.loopStart = 0;
    nodes.loopEnd = 0;
    if (nodes.source) {
      nodes.source.loop = false;
    }

    const deckInst = deckId === 'A' ? deckA : deckB;
    deckInst.setState(prev => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
      activeLoopBars: null,
      loopStart: 0,
      loopEnd: 0
    }));
    nodes.pausedAt = 0;
  };

  const triggerAutomatedTransition = (fromDeckId, toDeckId, incomingTrack) => {
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
    const currentDeck = fromDeckId === 'A' ? deckARef.current : deckBRef.current;
    const targetDeck = toDeckId === 'A' ? deckARef.current : deckBRef.current;

    addLog(`Iniciando mezcla automática: Deck ${fromDeckId} ➔ Deck ${toDeckId}`);
    
    const nodesFrom = getNodes(fromDeckId);
    const nodesTo = getNodes(toDeckId);

    const targetTrack = incomingTrack || targetDeck.track;
    
    const cuePoint = (currentDjMode !== 'jukebox' && targetTrack) ? (targetTrack.cue || 0) : 0;
    nodesTo.pausedAt = cuePoint;
    
    const toDeck = toDeckId === 'A' ? deckA : deckB;
    toDeck.setState(prev => ({ ...prev, currentTime: cuePoint }));
    
    const pitchOffset = currentDjMode === 'jukebox' ? 0 : (targetTrack ? (((masterBpm - targetTrack.bpm) / targetTrack.bpm) * 100) : 0);
    nodesTo.pitch = pitchOffset;
    toDeck.setState(prev => ({ ...prev, pitch: pitchOffset }));
    if (nodesTo.source) {
      nodesTo.source.playbackRate.value = 1 + (pitchOffset / 100);
    }
    
    if (currentDjMode === 'jukebox') {
      addLog(`Alineando tempo (Modo Jukebox): Deck ${toDeckId} a velocidad original (${targetTrack?.bpm} BPM)`);
      nodesTo.lowShelf.gain.value = 0;
      nodesTo.midPeaking.gain.value = 0;
      nodesTo.highShelf.gain.value = 0;
      toDeck.setState(prev => ({ ...prev, eq: { low: 0, mid: 0, high: 0 } }));
    } else {
      addLog(`Alineando tempo: Sincronizando Deck ${toDeckId} a ${masterBpm} BPM (${pitchOffset > 0 ? '+' : ''}${pitchOffset.toFixed(2)}% de velocidad)`);
      nodesTo.lowShelf.gain.value = -40;
      nodesTo.midPeaking.gain.value = -40;
      nodesTo.highShelf.gain.value = -40;
      toDeck.setState(prev => ({ ...prev, eq: { low: -40, mid: -40, high: -40 } }));
    }

    // --- BEAT GRID ALIGNMENT ---
    const activeTrack = currentDeck.track;
    const pitchFrom = currentDeck.pitch;
    const pausedAtTo = nodesTo.pausedAt || 0.0;

    const { startTime, delay, highPrecisionTime } = calculateBeatAlignment(
      ctx, nodesFrom, activeTrack, pitchFrom, targetTrack, pitchOffset, pausedAtTo, masterBpm
    );

    toDeck.playDeckSource(startTime, pitchOffset);
    toDeck.setState(prev => ({ ...prev, isPlaying: true }));
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

    toDeck.setState(prev => ({ ...prev, volume: 1.0 }));

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
    const scheduler = getAutoloadScheduler();

    const scheduleTransitionCompletion = (completionTime, isJukebox) => {
      const tId = setTimeout(() => {
        setTransitionState({ active: false, phase: 'idle', progress: 0 });
        transitionActiveRef.current = false;
        setActiveDeckId(toDeckId);
        
        const fromDeck = fromDeckId === 'A' ? deckA : deckB;
        fromDeck.stopDeckSource();
        fromDeck.setState(prev => ({
          ...prev,
          isPlaying: false,
          currentTime: 0,
          eq: { low: 0, mid: 0, high: 0 },
          volume: 1.0
        }));
        resetDeckEq(nodesFrom);

        toDeck.setState(prev => ({ ...prev, eq: { low: 0, mid: 0, high: 0 } }));

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
  };

  const checkAutoDjTransition = (playingDeckId, currentTime) => {
    const currentDjMode = djModeRef.current;
    const isAutoDjActive = currentDjMode !== 'manual';
    if (!isAutoDjActive || transitionState.active || transitionActiveRef.current) return;
    if (transitionCheckedRef.current[playingDeckId]) return;

    const currentDeck = playingDeckId === 'A' ? deckARef.current : deckBRef.current;
    const targetDeckId = playingDeckId === 'A' ? 'B' : 'A';
    const targetDeck = targetDeckId === 'A' ? deckARef.current : deckBRef.current;

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
        triggerAutomatedTransition(playingDeckId, targetDeckId, targetDeck.track);
      } else {
        const compatibleTrack = findCompatibleTrack(currentDeck.track);
        
        if (compatibleTrack) {
          if (currentDjMode === 'jukebox') {
            addLog(`Jukebox: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
          } else {
            addLog(`Auto-DJ: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
          }
          loadTrackIntoDeck(compatibleTrack, targetDeckId, true, true);
        } else {
          if (currentDjMode === 'jukebox') {
            addLog(`Jukebox Advertencia: No hay canciones en la biblioteca para mezclar automáticamente.`);
          } else {
            addLog(`Auto-DJ Advertencia: No hay canciones compatibles en la biblioteca (BPM ±5.0% y Camelot Key compatible) para mezclar automáticamente.`);
          }
        }
      }
    }
  };

  const loadTrackIntoDeck = (track, deckId, startAutoTransition = false, isAutoload = false) => {
    initAudio();

    const currentDjMode = djModeRef.current;
    const currentDeck = deckId === 'A' ? deckA.state : deckB.state;
    const modeLabel = currentDjMode === 'jukebox' ? 'Jukebox' : 'Auto-DJ';
    
    if (isAutoload && currentDeck.track && currentDeck.isUserSelected) {
      addLog(`${modeLabel}: Conservando la canción "${currentDeck.track.title}" elegida por el usuario en Deck ${deckId}.`);
      return;
    }

    if (!isAutoload && autoloadSchedulerRef.current) {
      autoloadSchedulerRef.current.cancel(deckId);
      addLog(`${modeLabel}: Cancelado pre-cargado automático en Deck ${deckId} debido a carga manual.`);
    }

    setPlayedTrackIds(prev => prev.includes(track.id) ? prev : [...prev, track.id]);

    const initialPitch = currentDjMode === 'jukebox' ? 0 : (((masterBpm - track.bpm) / track.bpm) * 100);
    const trackCue = track.cue || 0;
    const initialPausedAt = (!isAutoload && trackCue > 0) ? trackCue : 0;

    transitionCheckedRef.current[deckId] = false;

    if (deckId === 'A') {
      deckA.loadTrack(track, isAutoload, initialPitch, initialPausedAt);
      if (startAutoTransition) {
        triggerAutomatedTransition('B', 'A', track);
      }
    } else {
      deckB.loadTrack(track, isAutoload, initialPitch, initialPausedAt);
      if (startAutoTransition) {
        triggerAutomatedTransition('A', 'B', track);
      }
    }
  };

  // sessionElapsedTime timer: running 1s intervals when any deck is playing
  const isPlayingA = deckA.state.isPlaying;
  const isPlayingB = deckB.state.isPlaying;

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

  // Channel volume control logic
  useEffect(() => {
    const nodesA = getNodes('A');
    const nodesB = getNodes('B');
    if (!nodesA.gainNode || !nodesB.gainNode) return;

    if (!transitionState.active) {
      nodesA.gainNode.gain.value = deckA.state.volume;
      nodesB.gainNode.gain.value = deckB.state.volume;
    }
  }, [deckA.state.volume, deckB.state.volume, transitionState.active]);

  const resyncDecks = () => {
    if (!deckA.state.isPlaying || !deckB.state.isPlaying) {
      addLog("Sincronización: Ambos decks deben estar reproduciéndose para resincronizar.");
      return;
    }

    const masterId = activeDeckId; // 'A' or 'B'
    const slaveId = masterId === 'A' ? 'B' : 'A';
    const masterDeck = masterId === 'A' ? deckA : deckB;
    const slaveDeck = slaveId === 'A' ? deckA : deckB;

    if (!masterDeck.state.track || !slaveDeck.state.track) return;

    // 1. BPM/Pitch matching
    const masterBpmVal = masterBpm;
    const slaveOriginalBpm = slaveDeck.state.track.bpm;
    const targetPitch = ((masterBpmVal - slaveOriginalBpm) / slaveOriginalBpm) * 100;

    slaveDeck.updatePitch(targetPitch);

    // 2. Phase Alignment
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const t_master = masterDeck.state.currentTime;
    const t_slave = slaveDeck.state.currentTime;

    const firstBeatOffsetMaster = masterDeck.state.track.firstBeatOffset || 0.0;
    const firstBeatOffsetSlave = slaveDeck.state.track.firstBeatOffset || 0.0;

    const beatDurationMaster = 60 / masterDeck.state.track.bpm;
    const beatDurationSlave = 60 / slaveDeck.state.track.bpm;

    const elapsedMaster = t_master - firstBeatOffsetMaster;
    const phaseMaster = ((elapsedMaster % beatDurationMaster) + beatDurationMaster) % beatDurationMaster / beatDurationMaster;

    const k = Math.round((t_slave - firstBeatOffsetSlave) / beatDurationSlave - phaseMaster);
    let targetTime = firstBeatOffsetSlave + (k + phaseMaster) * beatDurationSlave;

    if (targetTime < 0) targetTime = 0;
    if (targetTime > slaveDeck.state.duration) targetTime = slaveDeck.state.duration;

    const nodesSlave = getNodes(slaveId);
    nodesSlave.pausedAt = targetTime;

    if (slaveDeck.state.isPlaying) {
      slaveDeck.playDeckSource();
      nodesSlave.startTime = ctx.currentTime;
    }

    slaveDeck.setState(prev => ({ ...prev, currentTime: targetTime }));

    addLog(`Sincronización: Deck ${slaveId} sincronizado con Deck ${masterId} (Tiempo: ${t_slave.toFixed(2)}s ➔ ${targetTime.toFixed(2)}s).`);
  };

  const updateFx = (active, type, x, y, isInitialTouch = false) => {
    setFxState({ active, type, x, y });
    
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const deckId = activeDeckId;
    const nodes = getNodes(deckId);
    
    applyFx(nodes, ctx, { active, type, x, y, masterBpm, isInitialTouch });
  };

  return {
    deckA: deckA.state,
    deckB: deckB.state,
    masterBpm,
    transitionState,
    waveformData: { A: deckA.waveformData, B: deckB.waveformData },
    loadTrackIntoDeck,
    togglePlay: (deckId) => (deckId === 'A' ? deckA.togglePlay() : deckB.togglePlay()),
    seekTo: (deckId, percent) => (deckId === 'A' ? deckA.seekTo(percent) : deckB.seekTo(percent)),
    jumpToOutro: (deckId) => {
      const deckState = deckId === 'A' ? deckA.state : deckB.state;
      if (!deckState.track) return;
      const targetTime = Math.max(0, deckState.outroTime - 5);
      const targetPercent = targetTime / deckState.duration;
      if (deckId === 'A') deckA.seekTo(targetPercent);
      else deckB.seekTo(targetPercent);
      addLog(`Deck ${deckId}: Saltando a 5s antes del OUTRO para demostración.`);
    },
    handlePitchChange: (deckId, val) => (deckId === 'A' ? deckA.updatePitch(parseFloat(val)) : deckB.updatePitch(parseFloat(val))),
    handleEqChange: (deckId, band, val) => (deckId === 'A' ? deckA.handleEqChange(band, val) : deckB.handleEqChange(band, val)),
    handleVolumeChange: (deckId, val) => (deckId === 'A' ? deckA.handleVolumeChange(val) : deckB.handleVolumeChange(val)),
    changeMasterBpm,
    djMode,
    setDjMode,
    autoDj,
    autoDjStyle,
    setAutoDjStyle,
    eqOrder,
    setEqOrder,
    resyncDecks,
    playedTrackIds,
    sessionElapsedTime,
    activeDeckId,
    setActiveDeckId,
    initAudio,
    audioCtxRef,
    fxState,
    updateFx,
    toggleVinylMode: (deckId) => (deckId === 'A' ? deckA.toggleVinylMode() : deckB.toggleVinylMode()),
    startScratch: (deckId, isUpperHalf, clientX, clientY) => (deckId === 'A' ? deckA.startScratch(isUpperHalf, clientX, clientY, () => transitionState.active) : deckB.startScratch(isUpperHalf, clientX, clientY, () => transitionState.active)),
    updateScratch: (deckId, clientX, width) => (deckId === 'A' ? deckA.updateScratch(clientX, width, () => transitionState.active) : deckB.updateScratch(clientX, width, () => transitionState.active)),
    stopScratch: (deckId, isQuickClick, clickPercent) => (deckId === 'A' ? deckA.stopScratch(isQuickClick, clickPercent, () => transitionState.active) : deckB.stopScratch(isQuickClick, clickPercent, () => transitionState.active)),
    toggleDeckLoop: (deckId, bars) => (deckId === 'A' ? deckA.toggleDeckLoop(bars) : deckB.toggleDeckLoop(bars)),
    updateDeckCuePoints: (deckId, markerType, newTime) => (deckId === 'A' ? deckA.updateDeckCuePoints(markerType, newTime) : deckB.updateDeckCuePoints(markerType, newTime))
  };
}
