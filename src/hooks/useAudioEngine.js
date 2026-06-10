import { useState, useEffect, useRef } from 'react'
import { areKeysCompatible } from '../utils/audioAnalyzer'
import { formatTime } from '../utils/formatTime'
import { createDeckGraph } from '../audio/audioGraph'
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
import {
  handleScratchStart as scratchStart,
  handleScratchUpdate as scratchUpdate,
  handleScratchStop as scratchStop
} from '../audio/scratchEngine'

export function useAudioEngine({ library, addLog }) {
  // Decks State
  const [deckA, setDeckA] = useState({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0, // pitch fader offset (-10% to +10%)
    volume: 1.0,
    eq: { low: 0, mid: 0, high: 0 }, // values in dB (-40 to 12)
    outroTime: 0,
    introTime: 0,
    vinylMode: true,
    isUserSelected: false,
    activeLoopBars: null,
    loopStart: 0,
    loopEnd: 0
  });

  const [deckB, setDeckB] = useState({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0,
    volume: 1.0,
    eq: { low: 0, mid: 0, high: 0 },
    outroTime: 0,
    introTime: 0,
    vinylMode: true,
    isUserSelected: false,
    activeLoopBars: null,
    loopStart: 0,
    loopEnd: 0
  });


  const [djMode, setDjMode] = useState('autodj'); // 'manual', 'autodj', 'jukebox'
  const autoDj = djMode !== 'manual';
  const [autoDjStyle, setAutoDjStyle] = useState('eq'); // 'eq' (EQ Ramp Mix) or 'bass' (Bassline Swap)
  const [eqOrder, setEqOrder] = useState(['mid', 'low', 'high']);
  const [playedTrackIds, setPlayedTrackIds] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState('A'); // 'A' or 'B'
  const [masterBpm, setMasterBpm] = useState(128); // Default to 128 BPM
  const [transitionState, setTransitionState] = useState({
    active: false,
    phase: 'idle', // 'idle', 'aligning', 'volume', 'mids', 'highs', 'lows', 'boost'
    progress: 0
  });

  const isScratchingRef = useRef({ A: false, B: false });
  const dragModeRef = useRef({ A: null, B: null }); // 'scratch' | 'bend' | null
  const lastXRef = useRef({ A: 0, B: 0 });
  const lastTimeRef = useRef({ A: 0, B: 0 });
  const bendTimeoutRef = useRef({ A: null, B: null });

  const [sessionElapsedTime, setSessionElapsedTime] = useState(0);
  const [fxState, setFxState] = useState({
    active: false,
    type: 'Filter',
    x: 0.5,
    y: 0.5
  });

  // Refs to prevent multiple transition triggers/warnings in rapid succession
  const transitionActiveRef = useRef(false);
  const transitionCheckedRef = useRef({ A: false, B: false });
  const lastSecsRef = useRef(0);
  const elapsedAccumulatorRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());

  // Refs for async timer stability (avoiding stale closures)
  const libraryRef = useRef(library);
  const playedTrackIdsRef = useRef(playedTrackIds);
  const djModeRef = useRef(djMode);
  const masterBpmRef = useRef(masterBpm);
  const activeDeckIdRef = useRef(activeDeckId);
  const deckARef = useRef(deckA);
  const deckBRef = useRef(deckB);

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
    activeDeckIdRef.current = activeDeckId;
  }, [activeDeckId]);

  useEffect(() => {
    deckARef.current = deckA;
    deckBRef.current = deckB;
  }, [deckA, deckB]);

  // --- REFS FOR WEB AUDIO API ---
  const audioCtxRef = useRef(null);
  
  // Deck Audio Nodes Refs
  const nodesRef = useRef({
    A: {
      source: null,
      buffer: null,
      lowShelf: null,
      midPeaking: null,
      highShelf: null,
      gainNode: null,
      startTime: 0,
      pausedAt: 0,
      pitch: 0,
      loopActive: false,
      loopStart: 0,
      loopEnd: 0,
      activeLoopBars: null
    },
    B: {
      source: null,
      buffer: null,
      lowShelf: null,
      midPeaking: null,
      highShelf: null,
      gainNode: null,
      startTime: 0,
      pausedAt: 0,
      pitch: 0,
      loopActive: false,
      loopStart: 0,
      loopEnd: 0,
      activeLoopBars: null
    }
  });

  // Animation Frame Ref
  const animationRef = useRef(null);
  
  // Waveform data for drawing
  const [waveformData, setWaveformData] = useState({ A: null, B: null });

  // --- Autoload Scheduler (using extracted module) ---
  const autoloadSchedulerRef = useRef(null);

  // findCompatibleTrack wrapper that reads from refs
  const findCompatibleTrack = (currentTrack) => {
    return findCompatible(currentTrack, libraryRef.current, playedTrackIdsRef.current, djModeRef.current);
  };

  // Initialize autoload scheduler lazily (needs loadTrackIntoDeck which is defined below)
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
    djModeRef.current = djMode;
    if (djMode === 'manual') {
      if (autoloadSchedulerRef.current) {
        autoloadSchedulerRef.current.cancelAll();
      }
    } else if (djMode === 'jukebox') {
      // Respect original BPMs: reset pitch faders of both decks to 0
      updatePitch('A', 0);
      updatePitch('B', 0);
      setDeckA(prev => ({ ...prev, pitch: 0 }));
      setDeckB(prev => ({ ...prev, pitch: 0 }));
      
      // Update masterBpm to the active track's BPM (if playing/loaded)
      const currentActiveDeck = activeDeckIdRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (currentActiveDeck && currentActiveDeck.track) {
        setMasterBpm(currentActiveDeck.track.bpm);
      }
    } else if (djMode === 'autodj') {
      // When switching back to Auto-DJ, sync decks to current masterBpm
      const currentMasterBpm = masterBpmRef.current;
      setDeckA(prev => {
        if (prev.track) {
          const pitchVal = ((currentMasterBpm - prev.track.bpm) / prev.track.bpm) * 100;
          updatePitch('A', pitchVal);
          return { ...prev, pitch: pitchVal };
        }
        return prev;
      });
      setDeckB(prev => {
        if (prev.track) {
          const pitchVal = ((currentMasterBpm - prev.track.bpm) / prev.track.bpm) * 100;
          updatePitch('B', pitchVal);
          return { ...prev, pitch: pitchVal };
        }
        return prev;
      });
    }
  }, [djMode]);

  // --- INITIALIZE AUDIO CONTEXT ---
  const initAudio = () => {
    if (audioCtxRef.current) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    
    // Create Deck A and B graphs using the factory
    const graphA = createDeckGraph(ctx);
    nodesRef.current.A = {
      ...nodesRef.current.A,
      ...graphA
    };

    const graphB = createDeckGraph(ctx);
    nodesRef.current.B = {
      ...nodesRef.current.B,
      ...graphB
    };

    addLog("Web Audio Engine inicializado correctamente.");
  };

  const updatePitch = (deckId, newPitch) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const nodes = nodesRef.current[deckId];
    
    if (nodes.source) {
      const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
      const oldPlaybackRate = 1 + (nodes.pitch / 100);
      nodes.pausedAt += elapsed * oldPlaybackRate;
      nodes.startTime = ctx.currentTime;
      
      const newPlaybackRate = 1 + (newPitch / 100);
      nodes.source.playbackRate.value = newPlaybackRate;
    }
    nodes.pitch = newPitch;
  };

  const changeMasterBpm = (newBpm) => {
    setMasterBpm(newBpm);
    
    if (djModeRef.current === 'jukebox') {
      // In Jukebox mode, the playing tracks always respect their original BPM.
      // Changing the master BPM fader does not affect deck playback rate.
      return;
    }
    
    setDeckA(prev => {
      if (prev.track) {
        const originalBpm = prev.track.bpm;
        const pitchOffset = ((newBpm - originalBpm) / originalBpm) * 100;
        updatePitch('A', pitchOffset);
        return { ...prev, pitch: pitchOffset };
      }
      return prev;
    });

    setDeckB(prev => {
      if (prev.track) {
        const originalBpm = prev.track.bpm;
        const pitchOffset = ((newBpm - originalBpm) / originalBpm) * 100;
        updatePitch('B', pitchOffset);
        return { ...prev, pitch: pitchOffset };
      }
      return prev;
    });
  };

  // Handle track ending
  const handlePlaybackEnded = (deckId) => {
    addLog(`Deck ${deckId}: Canción finalizada.`);
    const nodes = nodesRef.current[deckId];
    nodes.loopActive = false;
    nodes.activeLoopBars = null;
    nodes.loopStart = 0;
    nodes.loopEnd = 0;
    if (nodes.source) {
      nodes.source.loop = false;
    }

    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, isPlaying: false, currentTime: 0, activeLoopBars: null, loopStart: 0, loopEnd: 0 }));
      nodesRef.current.A.pausedAt = 0;
    } else {
      setDeckB(prev => ({ ...prev, isPlaying: false, currentTime: 0, activeLoopBars: null, loopStart: 0, loopEnd: 0 }));
      nodesRef.current.B.pausedAt = 0;
    }
  };

  // Trigger the multi-phase EQ Transition
  const triggerAutomatedTransition = (fromDeckId, toDeckId, incomingTrack) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    transitionActiveRef.current = true;
    setTransitionState({
      active: true,
      phase: 'aligning',
      progress: 0
    });

    const currentDjMode = djModeRef.current;

    addLog(`Iniciando mezcla automática: Deck ${fromDeckId} ➔ Deck ${toDeckId}`);
    
    const nodesFrom = nodesRef.current[fromDeckId];
    const nodesTo = nodesRef.current[toDeckId];

    const targetTrack = incomingTrack || (toDeckId === 'A' ? deckA.track : deckB.track);
    
    // In Jukebox mode, the incoming track plays at its natural tempo (pitchOffset = 0)
    const pitchOffset = currentDjMode === 'jukebox' ? 0 : (targetTrack ? (((masterBpm - targetTrack.bpm) / targetTrack.bpm) * 100) : 0);
    
    nodesRef.current[toDeckId].pitch = pitchOffset;
    
    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, pitch: pitchOffset }));
      if (nodesRef.current.A.source) {
        nodesRef.current.A.source.playbackRate.value = 1 + (pitchOffset / 100);
      }
    } else {
      setDeckB(prev => ({ ...prev, pitch: pitchOffset }));
      if (nodesRef.current.B.source) {
        nodesRef.current.B.source.playbackRate.value = 1 + (pitchOffset / 100);
      }
    }
    
    if (currentDjMode === 'jukebox') {
      addLog(`Alineando tempo (Modo Jukebox): Deck ${toDeckId} a velocidad original (${targetTrack?.bpm} BPM)`);
      nodesTo.lowShelf.gain.value = 0;
      nodesTo.midPeaking.gain.value = 0;
      nodesTo.highShelf.gain.value = 0;
      const targetEqUpdate = { low: 0, mid: 0, high: 0 };
      if (toDeckId === 'A') {
        setDeckA(prev => ({ ...prev, eq: targetEqUpdate }));
      } else {
        setDeckB(prev => ({ ...prev, eq: targetEqUpdate }));
      }
    } else {
      addLog(`Alineando tempo: Sincronizando Deck ${toDeckId} a ${masterBpm} BPM (${pitchOffset > 0 ? '+' : ''}${pitchOffset.toFixed(2)}% de velocidad)`);
      nodesTo.lowShelf.gain.value = -40;
      nodesTo.midPeaking.gain.value = -40;
      nodesTo.highShelf.gain.value = -40;
      const targetEqUpdate = { low: -40, mid: -40, high: -40 };
      if (toDeckId === 'A') {
        setDeckA(prev => ({ ...prev, eq: targetEqUpdate }));
      } else {
        setDeckB(prev => ({ ...prev, eq: targetEqUpdate }));
      }
    }

    // --- BEAT GRID ALIGNMENT (delegated to transitionEngine) ---
    const activeTrack = fromDeckId === 'A' ? deckA.track : deckB.track;
    const pitchFrom = fromDeckId === 'A' ? deckA.pitch : deckB.pitch;
    const pausedAtTo = nodesTo.pausedAt || 0.0;

    const { startTime, delay, highPrecisionTime } = calculateBeatAlignment(
      ctx, nodesFrom, activeTrack, pitchFrom, targetTrack, pitchOffset, pausedAtTo, masterBpm
    );

    playDeckSource(toDeckId, startTime, pitchOffset);
    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, isPlaying: true }));
      nodesRef.current.A.pausedAt = 0;
    } else {
      setDeckB(prev => ({ ...prev, isPlaying: true }));
      nodesRef.current.B.pausedAt = 0;
    }

    const calculatedDelay = startTime - ctx.currentTime;
    addLog(`Alineación rítmica: Lanzando Deck ${toDeckId} (primer golpe a +${(calculatedDelay * 1000).toFixed(0)}ms)`);

    // --- TRANSITION TIMING (delegated to transitionEngine) ---
    const currentDeckDuration = fromDeckId === 'A' ? deckA.duration : deckB.duration;
    const outroTimeFrom = fromDeckId === 'A' ? deckA.outroTime : deckB.outroTime;
    const introTimeVal = incomingTrack ? incomingTrack.intro : 90;
    const fromDeckVolume = fromDeckId === 'A' ? deckA.volume : deckB.volume;

    const timing = calculateTransitionTiming(
      currentDeckDuration, outroTimeFrom, introTimeVal, highPrecisionTime, delay, startTime, currentDjMode
    );

    const { transitionDuration, phaseDuration, t0, t1, t2, t3 } = timing;
    
    addLog(`Duración de mezcla: ${transitionDuration.toFixed(1)}s (outro saliente: ${timing.outroDuration.toFixed(1)}s, intro entrante: ${timing.introDuration.toFixed(1)}s) — 3 fases de ${phaseDuration.toFixed(1)}s.`);

    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, volume: 1.0 }));
    } else {
      setDeckB(prev => ({ ...prev, volume: 1.0 }));
    }

    // --- SCHEDULE AUDIO RAMPS (delegated to transitionEngine) ---
    const fromBpm = activeTrack ? activeTrack.bpm : 120;
    const playbackRateFrom = 1 + (pitchFrom / 100);

    if (currentDjMode === 'jukebox') {
      scheduleJukeboxTransition(nodesFrom, nodesTo, t0, t3, fromDeckVolume, targetTrack?.bpm, fromBpm, playbackRateFrom);
    } else if (autoDjStyle === 'bass') {
      scheduleEqualPowerCrossfade(nodesFrom, nodesTo, t0, t3, fromDeckVolume);
      const fromEq = fromDeckId === 'A' ? deckA.eq : deckB.eq;
      scheduleBasslineSwap(nodesFrom, nodesTo, t0, t3, fromEq);
    } else {
      scheduleAutoDjVolume(nodesFrom, nodesTo, t0, t3, fromDeckVolume);
      const fromEq = fromDeckId === 'A' ? deckA.eq : deckB.eq;
      scheduleEqTransition(nodesFrom, nodesTo, eqOrder, [t0, t1, t2, t3], fromEq);
    }

    // --- SCHEDULE UI/STATE UPDATES ---
    const scheduler = getAutoloadScheduler();

    const scheduleTransitionCompletion = (completionTime, isJukebox) => {
      setTimeout(() => {
        setTransitionState({ active: false, phase: 'idle', progress: 0 });
        transitionActiveRef.current = false;
        setActiveDeckId(toDeckId);
        
        stopDeckSource(fromDeckId);
        if (fromDeckId === 'A') {
          setDeckA(prev => ({
            ...prev,
            isPlaying: false,
            currentTime: 0,
            eq: { low: 0, mid: 0, high: 0 },
            volume: 1.0
          }));
        } else {
          setDeckB(prev => ({
            ...prev,
            isPlaying: false,
            currentTime: 0,
            eq: { low: 0, mid: 0, high: 0 },
            volume: 1.0
          }));
        }
        resetDeckEq(nodesFrom);

        const defaultEq = { low: 0, mid: 0, high: 0 };
        if (toDeckId === 'A') {
          setDeckA(prev => ({ ...prev, eq: defaultEq }));
        } else {
          setDeckB(prev => ({ ...prev, eq: defaultEq }));
        }

        if (isJukebox && targetTrack) {
          changeMasterBpm(targetTrack.bpm);
          addLog(`¡Mezcla Jukebox completada! Deck ${toDeckId} ahora en vivo a ${targetTrack?.bpm} BPM.`);
        } else {
          addLog(`¡Mezcla completada! Deck ${toDeckId} ahora en vivo tras el DROP.`);
        }
        scheduler.queue(fromDeckId, targetTrack, djModeRef.current);
      }, completionTime * 1000);
    };

    if (currentDjMode === 'jukebox') {
      setTimeout(() => {
        setTransitionState(prev => ({ ...prev, phase: 'crossfade', progress: 10 }));
        addLog(`Transición Jukebox: Iniciando Crossfade y rampa de tempo hacia ${targetTrack?.bpm} BPM...`);
      }, delay * 1000);

      setTimeout(() => {
        setTransitionState(prev => ({ ...prev, progress: 50 }));
      }, (delay + transitionDuration / 2) * 1000);

      setTimeout(() => {
        setTransitionState(prev => ({ ...prev, progress: 90 }));
      }, (delay + transitionDuration * 0.9) * 1000);

      scheduleTransitionCompletion(delay + transitionDuration, true);
    } else if (autoDjStyle === 'bass') {
      setTimeout(() => {
        setTransitionState(prev => ({ ...prev, phase: 'crossfade', progress: 15 }));
        addLog(`Transición Bassline Swap: Mezclando melodías con curva de potencia constante...`);
      }, delay * 1000);

      setTimeout(() => {
        setTransitionState(prev => ({ ...prev, phase: 'lows', progress: 50 }));
        addLog(`¡BASSLINE SWAP! Intercambiando frecuencias bajas en el compás.`);
      }, (delay + transitionDuration / 2) * 1000);

      setTimeout(() => {
        setTransitionState(prev => ({ ...prev, progress: 85 }));
      }, (delay + transitionDuration * 0.85) * 1000);

      scheduleTransitionCompletion(delay + transitionDuration, false);
    } else {
      setTimeout(() => {
        const b = eqOrder[0];
        setTransitionState(prev => ({ ...prev, phase: PHASE_DETAILS[b].phase, progress: 15 }));
        addLog(`Transición [1/3]: ${PHASE_DETAILS[b].msg}`);
      }, delay * 1000);

      setTimeout(() => {
        const b = eqOrder[1];
        setTransitionState(prev => ({ ...prev, phase: PHASE_DETAILS[b].phase, progress: 50 }));
        addLog(`Transición [2/3]: ${PHASE_DETAILS[b].msg}`);
      }, (delay + phaseDuration) * 1000);

      setTimeout(() => {
        const b = eqOrder[2];
        setTransitionState(prev => ({ ...prev, phase: PHASE_DETAILS[b].phase, progress: 85 }));
        addLog(`Transición [3/3]: ${PHASE_DETAILS[b].msg}`);
      }, (delay + 2 * phaseDuration) * 1000);

      scheduleTransitionCompletion(delay + 3 * phaseDuration, false);
    }
  };

  const checkAutoDjTransition = (playingDeckId, currentTime) => {
    const currentDjMode = djModeRef.current;
    const isAutoDjActive = currentDjMode !== 'manual';
    if (!isAutoDjActive || transitionState.active || transitionActiveRef.current) return;
    if (transitionCheckedRef.current[playingDeckId]) return;

    const currentDeck = playingDeckId === 'A' ? deckA : deckB;
    const targetDeckId = playingDeckId === 'A' ? 'B' : 'A';
    const targetDeck = targetDeckId === 'A' ? deckA : deckB;

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

    // Check if the current track in the deck is user-selected and we are trying to autoload
    const currentDeck = deckId === 'A' ? deckA : deckB;
    const modeLabel = currentDjMode === 'jukebox' ? 'Jukebox' : 'Auto-DJ';
    if (isAutoload && currentDeck.track && currentDeck.isUserSelected) {
      addLog(`${modeLabel}: Conservando la canción "${currentDeck.track.title}" elegida por el usuario en Deck ${deckId}.`);
      return;
    }

    stopDeckSource(deckId);
    transitionCheckedRef.current[deckId] = false;

    // Reset loop parameters in nodesRef
    nodesRef.current[deckId].loopActive = false;
    nodesRef.current[deckId].loopStart = 0;
    nodesRef.current[deckId].loopEnd = 0;
    nodesRef.current[deckId].activeLoopBars = null;

    // If loaded manually by user, clear any pending autoload timer for this deck
    if (!isAutoload && autoloadSchedulerRef.current) {
      autoloadSchedulerRef.current.cancel(deckId);
      addLog(`${modeLabel}: Cancelado pre-cargado automático en Deck ${deckId} debido a carga manual.`);
    }

    // Track played history
    setPlayedTrackIds(prev => prev.includes(track.id) ? prev : [...prev, track.id]);

    nodesRef.current[deckId].buffer = track.buffer;
    nodesRef.current[deckId].pausedAt = 0;

    const rawData = track.buffer.getChannelData(0);
    const step = Math.floor(rawData.length / 300);
    const peaks = [];
    let maxVal = 0;
    
    for (let i = 0; i < 300; i++) {
      let sum = 0;
      const startIdx = i * step;
      for (let j = 0; j < step; j++) {
        const val = rawData[startIdx + j];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / step);
      peaks.push(rms);
      if (rms > maxVal) maxVal = rms;
    }
    
    // Normalize to 1.0 to ensure the waveform fits the canvas height beautifully
    const normalizedPeaks = maxVal > 0 ? peaks.map(p => p / maxVal) : peaks;
    setWaveformData(prev => ({ ...prev, [deckId]: normalizedPeaks }));

    const initialPitch = currentDjMode === 'jukebox' ? 0 : (((masterBpm - track.bpm) / track.bpm) * 100);
    nodesRef.current[deckId].pitch = initialPitch;
    nodesRef.current[deckId].pausedAt = 0;

    const initialDeckState = {
      track: track,
      isPlaying: false,
      currentTime: 0,
      duration: track.buffer.duration,
      pitch: initialPitch,
      volume: 1.0,
      eq: { low: 0, mid: 0, high: 0 },
      outroTime: track.outro,
      introTime: track.intro,
      vinylMode: deckId === 'A' ? deckA.vinylMode : deckB.vinylMode,
      isUserSelected: !isAutoload,
      activeLoopBars: null,
      loopStart: 0,
      loopEnd: 0
    };

    if (deckId === 'A') {
      setDeckA(initialDeckState);
      addLog(`Cargado "${track.title}" en Deck A.`);
      if (startAutoTransition) {
        triggerAutomatedTransition('B', 'A', track);
      }
    } else {
      setDeckB(initialDeckState);
      addLog(`Cargado "${track.title}" en Deck B.`);
      if (startAutoTransition) {
        triggerAutomatedTransition('A', 'B', track);
      }
    }
  };

  const playDeckSource = (deckId, when = 0, pitchOverride = null) => {
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current[deckId];
    if (!ctx || !nodes.buffer) return;

    if (nodes.source) {
      try { nodes.source.stop(); } catch(e) {}
    }

    const source = ctx.createBufferSource();
    source.buffer = nodes.buffer;
    
    const pitch = pitchOverride !== null ? pitchOverride : nodes.pitch;
    source.playbackRate.value = 1 + (pitch / 100);
    nodes.pitch = pitch;

    // Apply loop attributes if active
    if (nodes.loopActive) {
      source.loop = true;
      source.loopStart = nodes.loopStart;
      source.loopEnd = nodes.loopEnd;
    }

    source.connect(nodes.lowShelf);
    nodes.source = source;

    const startOffset = nodes.pausedAt;
    
    if (when === 0) {
      source.start(0, startOffset);
      nodes.startTime = ctx.currentTime;
    } else {
      source.start(when, startOffset);
      nodes.startTime = when;
    }
  };

  const stopDeckSource = (deckId) => {
    const nodes = nodesRef.current[deckId];
    if (nodes.source) {
      try {
        nodes.source.stop();
      } catch(e) {}
      nodes.source = null;
    }
  };

  const togglePlay = (deckId) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];

    if (!nodes.buffer) return;

    if (deck.isPlaying) {
      stopDeckSource(deckId);
      const playbackRate = 1 + (nodes.pitch / 100);
      const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
      let newPausedAt = nodes.pausedAt + elapsed * playbackRate;
      if (nodes.loopActive) {
        const loopDuration = nodes.loopEnd - nodes.loopStart;
        if (newPausedAt >= nodes.loopEnd && loopDuration > 0) {
          const timeInLoop = (newPausedAt - nodes.loopStart) % loopDuration;
          newPausedAt = nodes.loopStart + timeInLoop;
        }
      }
      nodes.pausedAt = newPausedAt;
      
      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, isPlaying: false }));
      } else {
        setDeckB(prev => ({ ...prev, isPlaying: false }));
      }
      addLog(`Deck ${deckId}: Pausado.`);
    } else {
      playDeckSource(deckId);
      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, isPlaying: true }));
      } else {
        setDeckB(prev => ({ ...prev, isPlaying: true }));
      }
      setActiveDeckId(deckId);
      addLog(`Deck ${deckId}: Reproduciendo.`);
    }
  };

  const seekTo = (deckId, percent) => {
    const ctx = audioCtxRef.current;
    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];
    if (!nodes.buffer) return;

    // Clear active loop on manual seek
    if (nodes.loopActive) {
      nodes.loopActive = false;
      nodes.activeLoopBars = null;
      nodes.loopStart = 0;
      nodes.loopEnd = 0;
      if (nodes.source) {
        nodes.source.loop = false;
      }
      const setDeck = deckId === 'A' ? setDeckA : setDeckB;
      setDeck(prev => ({ ...prev, activeLoopBars: null, loopStart: 0, loopEnd: 0 }));
    }

    const targetTime = percent * deck.duration;
    nodes.pausedAt = targetTime;

    if (targetTime < deck.outroTime) {
      transitionCheckedRef.current[deckId] = false;
    }

    if (deck.isPlaying) {
      playDeckSource(deckId);
      nodes.startTime = ctx.currentTime;
    }
    
    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, currentTime: targetTime }));
    } else {
      setDeckB(prev => ({ ...prev, currentTime: targetTime }));
    }
    
    addLog(`Deck ${deckId}: Saltar a ${formatTime(targetTime)}.`);
  };

  const jumpToOutro = (deckId) => {
    const deck = deckId === 'A' ? deckA : deckB;
    if (!deck.track) return;
    
    const targetTime = Math.max(0, deck.outroTime - 5);
    seekTo(deckId, targetTime / deck.duration);
    addLog(`Deck ${deckId}: Saltando a 5s antes del OUTRO para demostración.`);
  };

  const handlePitchChange = (deckId, value) => {
    const val = parseFloat(value);
    updatePitch(deckId, val);
    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, pitch: val }));
    } else {
      setDeckB(prev => ({ ...prev, pitch: val }));
    }
  };

  const handleVolumeChange = (deckId, value) => {
    const val = parseFloat(value);
    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, volume: val }));
    } else {
      setDeckB(prev => ({ ...prev, volume: val }));
    }
  };

  const handleEqChange = (deckId, band, value) => {
    const val = parseInt(value);
    const nodes = nodesRef.current[deckId];
    
    if (nodes[band === 'low' ? 'lowShelf' : band === 'mid' ? 'midPeaking' : 'highShelf']) {
      nodes[band === 'low' ? 'lowShelf' : band === 'mid' ? 'midPeaking' : 'highShelf'].gain.value = val;
    }

    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, eq: { ...prev.eq, [band]: val } }));
    } else {
      setDeckB(prev => ({ ...prev, eq: { ...prev.eq, [band]: val } }));
    }
  };

  // --- PLAYBACK MONITORING LOOP ---
  useEffect(() => {
    const updatePlaybackProgress = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) {
        lastFrameTimeRef.current = performance.now();
        animationRef.current = requestAnimationFrame(updatePlaybackProgress);
        return;
      }

      const now = performance.now();
      const dt = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      if (deckA.isPlaying || deckB.isPlaying) {
        elapsedAccumulatorRef.current += dt;
        const currentSecs = Math.floor(elapsedAccumulatorRef.current);
        if (currentSecs !== lastSecsRef.current) {
          lastSecsRef.current = currentSecs;
          setSessionElapsedTime(currentSecs);
        }
      }

      if (deckA.isPlaying && !isScratchingRef.current.A) {
        const nodes = nodesRef.current.A;
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const playbackRate = 1 + (nodes.pitch / 100);
        let current = nodes.pausedAt + elapsed * playbackRate;
        
        if (nodes.loopActive) {
          const loopDuration = nodes.loopEnd - nodes.loopStart;
          if (current >= nodes.loopEnd && loopDuration > 0) {
            const timeInLoop = (current - nodes.loopStart) % loopDuration;
            current = nodes.loopStart + timeInLoop;
          }
        }
        
        if (current >= deckA.duration) {
          handlePlaybackEnded('A');
        } else {
          setDeckA(prev => ({ ...prev, currentTime: current }));
          checkAutoDjTransition('A', current);
        }
      }

      if (deckB.isPlaying && !isScratchingRef.current.B) {
        const nodes = nodesRef.current.B;
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const playbackRate = 1 + (nodes.pitch / 100);
        let current = nodes.pausedAt + elapsed * playbackRate;
        
        if (nodes.loopActive) {
          const loopDuration = nodes.loopEnd - nodes.loopStart;
          if (current >= nodes.loopEnd && loopDuration > 0) {
            const timeInLoop = (current - nodes.loopStart) % loopDuration;
            current = nodes.loopStart + timeInLoop;
          }
        }
        
        if (current >= deckB.duration) {
          handlePlaybackEnded('B');
        } else {
          setDeckB(prev => ({ ...prev, currentTime: current }));
          checkAutoDjTransition('B', current);
        }
      }

      animationRef.current = requestAnimationFrame(updatePlaybackProgress);
    };

    lastFrameTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(updatePlaybackProgress);
    return () => cancelAnimationFrame(animationRef.current);
  }, [deckA.isPlaying, deckA.duration, deckB.isPlaying, deckB.duration, autoDj, transitionState.active]);

  // Channel volume control logic (without crossfader)
  useEffect(() => {
    const nodesA = nodesRef.current.A;
    const nodesB = nodesRef.current.B;
    if (!nodesA.gainNode || !nodesB.gainNode) return;

    if (!transitionState.active) {
      nodesA.gainNode.gain.value = deckA.volume;
      nodesB.gainNode.gain.value = deckB.volume;
    }
  }, [deckA.volume, deckB.volume, transitionState.active]);

  const resyncDecks = () => {
    if (!deckA.isPlaying || !deckB.isPlaying) {
      addLog("Sincronización: Ambos decks deben estar reproduciéndose para resincronizar.");
      return;
    }

    const masterId = activeDeckId; // 'A' or 'B'
    const slaveId = masterId === 'A' ? 'B' : 'A';
    const masterDeck = masterId === 'A' ? deckA : deckB;
    const slaveDeck = slaveId === 'A' ? deckA : deckB;

    if (!masterDeck.track || !slaveDeck.track) return;

    // 1. BPM/Pitch matching
    const masterBpmVal = masterBpm;
    const slaveOriginalBpm = slaveDeck.track.bpm;
    const targetPitch = ((masterBpmVal - slaveOriginalBpm) / slaveOriginalBpm) * 100;

    updatePitch(slaveId, targetPitch);
    if (slaveId === 'A') {
      setDeckA(prev => ({ ...prev, pitch: targetPitch }));
    } else {
      setDeckB(prev => ({ ...prev, pitch: targetPitch }));
    }

    // 2. Phase Alignment
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const t_master = masterDeck.currentTime;
    const t_slave = slaveDeck.currentTime;

    const firstBeatOffsetMaster = masterDeck.track.firstBeatOffset || 0.0;
    const firstBeatOffsetSlave = slaveDeck.track.firstBeatOffset || 0.0;

    const beatDurationMaster = 60 / masterDeck.track.bpm;
    const beatDurationSlave = 60 / slaveDeck.track.bpm;

    const elapsedMaster = t_master - firstBeatOffsetMaster;
    const phaseMaster = ((elapsedMaster % beatDurationMaster) + beatDurationMaster) % beatDurationMaster / beatDurationMaster;

    const k = Math.round((t_slave - firstBeatOffsetSlave) / beatDurationSlave - phaseMaster);
    let targetTime = firstBeatOffsetSlave + (k + phaseMaster) * beatDurationSlave;

    if (targetTime < 0) targetTime = 0;
    if (targetTime > slaveDeck.duration) targetTime = slaveDeck.duration;

    const nodesSlave = nodesRef.current[slaveId];
    nodesSlave.pausedAt = targetTime;

    if (slaveDeck.isPlaying) {
      playDeckSource(slaveId);
      nodesSlave.startTime = ctx.currentTime;
    }

    if (slaveId === 'A') {
      setDeckA(prev => ({ ...prev, currentTime: targetTime }));
    } else {
      setDeckB(prev => ({ ...prev, currentTime: targetTime }));
    }

    addLog(`Sincronización: Deck ${slaveId} sincronizado con Deck ${masterId} (Tiempo: ${t_slave.toFixed(2)}s ➔ ${targetTime.toFixed(2)}s).`);
  };

  // FX update — delegates to fxEngine module
  const updateFx = (active, type, x, y, isInitialTouch = false) => {
    setFxState({ active, type, x, y });
    
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const deckId = activeDeckId;
    const nodes = nodesRef.current[deckId];
    
    applyFx(nodes, ctx, { active, type, x, y, masterBpm, isInitialTouch });
  };

  const toggleVinylMode = (deckId) => {
    if (deckId === 'A') {
      setDeckA(prev => {
        const nextVal = !prev.vinylMode;
        addLog(`Deck A: Vinyl Mode ${nextVal ? 'ACTIVADO' : 'DESACTIVADO'}.`);
        return { ...prev, vinylMode: nextVal };
      });
    } else {
      setDeckB(prev => {
        const nextVal = !prev.vinylMode;
        addLog(`Deck B: Vinyl Mode ${nextVal ? 'ACTIVADO' : 'DESACTIVADO'}.`);
        return { ...prev, vinylMode: nextVal };
      });
    }
  };

  // Scratch refs bundle for the scratch engine
  const scratchRefs = { isScratchingRef, dragModeRef, lastXRef, lastTimeRef, bendTimeoutRef };

  const startScratch = (deckId, isUpperHalf, clientX, clientY) => {
    if (transitionState.active) {
      addLog(`Deck ${deckId}: Interacción bloqueada durante mezcla automática.`);
      return;
    }
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];

    scratchStart(nodes, ctx, deck, isUpperHalf, clientX, scratchRefs, deckId, playDeckSource);
  };

  const updateScratch = (deckId, clientX, width) => {
    if (transitionState.active) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];

    const result = scratchUpdate(nodes, ctx, deck, clientX, width, scratchRefs, deckId);

    if (result) {
      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, currentTime: result.newTime }));
      } else {
        setDeckB(prev => ({ ...prev, currentTime: result.newTime }));
      }
    }
  };

  const stopScratch = (deckId, isQuickClick, clickPercent) => {
    if (transitionState.active) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];

    scratchStop(nodes, ctx, deck, isQuickClick, clickPercent, scratchRefs, deckId, seekTo, playDeckSource, stopDeckSource);
  };

  const toggleDeckLoop = (deckId, bars) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];
    if (!deck.track || !nodes.buffer) return;

    const setDeck = deckId === 'A' ? setDeckA : setDeckB;

    const bpm = deck.track.bpm || 120;
    const firstBeatOffset = deck.track.firstBeatOffset || 0;
    const beatDuration = 60 / bpm;
    const barDuration = 4 * beatDuration;
    const loopDuration = bars * barDuration;

    if (nodes.loopActive && nodes.activeLoopBars === bars) {
      // Case 1: Deactivate loop
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
      // Case 2: Resize loop (maintain loopStart, calculate new loopEnd)
      const newLoopEnd = Math.min(deck.duration, nodes.loopStart + loopDuration);
      nodes.activeLoopBars = bars;
      nodes.loopEnd = newLoopEnd;

      if (nodes.source) {
        nodes.source.loopEnd = newLoopEnd;
      }

      // If playing and current position is already past the new loopEnd,
      // restart playback within the new loop bounds.
      if (nodes.source && deck.isPlaying) {
        const playbackRate = 1 + (nodes.pitch / 100);
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const current = nodes.pausedAt + elapsed * playbackRate;
        if (current > newLoopEnd) {
          const newLoopDuration = newLoopEnd - nodes.loopStart;
          const timeInLoop = (current - nodes.loopStart) % newLoopDuration;
          nodes.pausedAt = nodes.loopStart + timeInLoop;
          playDeckSource(deckId);
        }
      }

      setDeck(prev => ({ ...prev, activeLoopBars: bars, loopEnd: newLoopEnd }));
      addLog(`Deck ${deckId}: Loop redimensionado a ${bars} barras (${formatTime(nodes.loopStart)} - ${formatTime(newLoopEnd)}).`);
    } else {
      // Case 3: Activate new loop
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
  };

  return {
    deckA,
    deckB,
    masterBpm,
    transitionState,
    waveformData,
    loadTrackIntoDeck,
    togglePlay,
    seekTo,
    jumpToOutro,
    handlePitchChange,
    handleEqChange,
    handleVolumeChange,
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
    toggleVinylMode,
    startScratch,
    updateScratch,
    stopScratch,
    toggleDeckLoop
  };
}
