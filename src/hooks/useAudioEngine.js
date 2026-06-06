import { useState, useEffect, useRef } from 'react'
import { areKeysCompatible } from '../utils/audioAnalyzer'
import { formatTime } from '../utils/formatTime'

export function useAudioEngine({ library, addLog }) {
  // Decks State
  const [deckA, setDeckA] = useState({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0, // pitch fader offset (-20% to +20%)
    volume: 1.0,
    eq: { low: 0, mid: 0, high: 0 }, // values in dB (-40 to 12)
    outroTime: 0,
    introTime: 0
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
    introTime: 0
  });


  const [autoDj, setAutoDj] = useState(true);
  const [activeDeckId, setActiveDeckId] = useState('A'); // 'A' or 'B'
  const [masterBpm, setMasterBpm] = useState(128); // Default to 128 BPM
  const [transitionState, setTransitionState] = useState({
    active: false,
    phase: 'idle', // 'idle', 'aligning', 'volume', 'mids', 'highs', 'lows', 'boost'
    progress: 0
  });

  // Refs to prevent multiple transition triggers/warnings in rapid succession
  const transitionActiveRef = useRef(false);
  const transitionCheckedRef = useRef({ A: false, B: false });

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
      pitch: 0
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
      pitch: 0
    }
  });

  // Animation Frame Ref
  const animationRef = useRef(null);
  
  // Waveform data for drawing
  const [waveformData, setWaveformData] = useState({ A: null, B: null });

  // --- INITIALIZE AUDIO CONTEXT ---
  const initAudio = () => {
    if (audioCtxRef.current) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    
    // Create Deck A Graph
    const lowA = ctx.createBiquadFilter();
    lowA.type = 'lowshelf';
    lowA.frequency.value = 250;
    
    const midA = ctx.createBiquadFilter();
    midA.type = 'peaking';
    midA.frequency.value = 1000;
    midA.Q.value = 1.0;
    
    const highA = ctx.createBiquadFilter();
    highA.type = 'highshelf';
    highA.frequency.value = 4000;
    
    const gainA = ctx.createGain();
    
    lowA.connect(midA);
    midA.connect(highA);
    highA.connect(gainA);
    gainA.connect(ctx.destination);
    
    nodesRef.current.A = {
      ...nodesRef.current.A,
      lowShelf: lowA,
      midPeaking: midA,
      highShelf: highA,
      gainNode: gainA
    };

    // Create Deck B Graph
    const lowB = ctx.createBiquadFilter();
    lowB.type = 'lowshelf';
    lowB.frequency.value = 250;
    
    const midB = ctx.createBiquadFilter();
    midB.type = 'peaking';
    midB.frequency.value = 1000;
    midB.Q.value = 1.0;
    
    const highB = ctx.createBiquadFilter();
    highB.type = 'highshelf';
    highB.frequency.value = 4000;
    
    const gainB = ctx.createGain();
    
    lowB.connect(midB);
    midB.connect(highB);
    highB.connect(gainB);
    gainB.connect(ctx.destination);
    
    nodesRef.current.B = {
      ...nodesRef.current.B,
      lowShelf: lowB,
      midPeaking: midB,
      highShelf: highB,
      gainNode: gainB
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
    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      nodesRef.current.A.pausedAt = 0;
    } else {
      setDeckB(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      nodesRef.current.B.pausedAt = 0;
    }
  };

  // Find a compatible track in the library
  const findCompatibleTrack = (currentTrack) => {
    if (!currentTrack) return null;
    
    return library.find(track => {
      if (track.id === currentTrack.id && library.length > 1) return false;
      
      const bpmDiffPercent = Math.abs(track.bpm - currentTrack.bpm) / currentTrack.bpm;
      const bpmCompatible = bpmDiffPercent <= 0.016;
      const keyCompatible = areKeysCompatible(track.key, currentTrack.key);

      return bpmCompatible && keyCompatible;
    });
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

    addLog(`Iniciando mezcla automática: Deck ${fromDeckId} ➔ Deck ${toDeckId}`);
    
    const nodesFrom = nodesRef.current[fromDeckId];
    const nodesTo = nodesRef.current[toDeckId];

    const targetTrack = incomingTrack || (toDeckId === 'A' ? deckA.track : deckB.track);
    const pitchOffset = targetTrack ? (((masterBpm - targetTrack.bpm) / targetTrack.bpm) * 100) : 0;
    
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

    // --- BEAT GRID ALIGNMENT ---
    const activeTrack = fromDeckId === 'A' ? deckA.track : deckB.track;
    const fromBpm = activeTrack ? activeTrack.bpm : 120;
    const pitchFrom = fromDeckId === 'A' ? deckA.pitch : deckB.pitch;
    const playbackRateFrom = 1 + (pitchFrom / 100);
    const firstBeatOffsetFrom = activeTrack ? (activeTrack.firstBeatOffset || 0.0) : 0.0;

    const elapsedSinceStart = Math.max(0, ctx.currentTime - nodesFrom.startTime);
    const highPrecisionTime = nodesFrom.pausedAt + elapsedSinceStart * playbackRateFrom;

    const beatDurationFrom = 60 / fromBpm;
    const timeSinceFirstBeat = highPrecisionTime - firstBeatOffsetFrom;
    const beatOffset = ((timeSinceFirstBeat % beatDurationFrom) + beatDurationFrom) % beatDurationFrom;
    
    const bufferSecondsToNextBeat = beatDurationFrom - beatOffset;
    const delay = bufferSecondsToNextBeat / playbackRateFrom;
    const targetBeatTime = ctx.currentTime + delay;
    const playbackRateTo = 1 + (pitchOffset / 100);
    const pausedAtTo = nodesTo.pausedAt || 0.0;
    const firstBeatOffsetTo = targetTrack ? (targetTrack.firstBeatOffset || 0.0) : 0.0;
    const beatDurationTo = 60 / ((targetTrack ? targetTrack.bpm : 120) || 120);
    
    const k = Math.max(0, Math.ceil((pausedAtTo - firstBeatOffsetTo) / beatDurationTo));
    const nextBeatPositionTo = firstBeatOffsetTo + k * beatDurationTo;
    const timeToIncomingBeat = (nextBeatPositionTo - pausedAtTo) / playbackRateTo;
    
    let startTime = targetBeatTime - timeToIncomingBeat;
    const syncedBeatDuration = 60 / masterBpm;
    while (startTime < ctx.currentTime + 0.05) {
      startTime += syncedBeatDuration;
    }

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

    const currentDeckDuration = fromDeckId === 'A' ? deckA.duration : deckB.duration;
    const remainingTime = Math.max(2, currentDeckDuration - (highPrecisionTime + delay));
    
    const defaultTransitionDuration = incomingTrack ? Math.max(90, incomingTrack.intro) : 90;
    const transitionDuration = Math.min(defaultTransitionDuration, remainingTime);
    const phaseDuration = transitionDuration / 3;
    const fromDeckVolume = fromDeckId === 'A' ? deckA.volume : deckB.volume;
    
    addLog(`Alineación del Drop: Mezcla de ecualización en 3 fases - Duración total: ${transitionDuration.toFixed(1)}s.`);

    const t0 = startTime;
    const t1 = t0 + phaseDuration;
    const t2 = t0 + 2 * phaseDuration;
    const t3 = t0 + 3 * phaseDuration;

    nodesTo.gainNode.gain.setValueAtTime(1.0, t0);
    nodesTo.gainNode.gain.setValueAtTime(1.0, t3);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t0);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t3);

    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, volume: 1.0 }));
    } else {
      setDeckB(prev => ({ ...prev, volume: 1.0 }));
    }

    // Phase 1: Mids Swap
    nodesFrom.midPeaking.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.mid : deckB.eq.mid, t0);
    nodesFrom.midPeaking.gain.linearRampToValueAtTime(-40, t1);
    nodesTo.midPeaking.gain.setValueAtTime(-40, t0);
    nodesTo.midPeaking.gain.linearRampToValueAtTime(0, t1);
    
    nodesTo.lowShelf.gain.setValueAtTime(-40, t0);
    nodesTo.lowShelf.gain.setValueAtTime(-40, t1);
    nodesTo.highShelf.gain.setValueAtTime(-40, t0);
    nodesTo.highShelf.gain.setValueAtTime(-40, t1);
    
    nodesFrom.lowShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.low : deckB.eq.low, t0);
    nodesFrom.lowShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.low : deckB.eq.low, t1);
    nodesFrom.highShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.high : deckB.eq.high, t0);
    nodesFrom.highShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.high : deckB.eq.high, t1);

    // Phase 2: Lows Swap
    nodesFrom.lowShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.low : deckB.eq.low, t1);
    nodesFrom.lowShelf.gain.linearRampToValueAtTime(-40, t2);
    nodesTo.lowShelf.gain.setValueAtTime(-40, t1);
    nodesTo.lowShelf.gain.linearRampToValueAtTime(0, t2);
    
    nodesTo.midPeaking.gain.setValueAtTime(0, t1);
    nodesTo.midPeaking.gain.setValueAtTime(0, t2);
    nodesTo.highShelf.gain.setValueAtTime(-40, t1);
    nodesTo.highShelf.gain.setValueAtTime(-40, t2);
    
    nodesFrom.midPeaking.gain.setValueAtTime(-40, t1);
    nodesFrom.midPeaking.gain.setValueAtTime(-40, t2);
    nodesFrom.highShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.high : deckB.eq.high, t1);
    nodesFrom.highShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.high : deckB.eq.high, t2);

    // Phase 3: Highs Swap
    nodesFrom.highShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.high : deckB.eq.high, t2);
    nodesFrom.highShelf.gain.linearRampToValueAtTime(-40, t3);
    nodesTo.highShelf.gain.setValueAtTime(-40, t2);
    nodesTo.highShelf.gain.linearRampToValueAtTime(0, t3);
    
    nodesTo.midPeaking.gain.setValueAtTime(0, t2);
    nodesTo.midPeaking.gain.setValueAtTime(0, t3);
    nodesTo.lowShelf.gain.setValueAtTime(0, t2);
    nodesTo.lowShelf.gain.setValueAtTime(0, t3);
    
    nodesFrom.midPeaking.gain.setValueAtTime(-40, t2);
    nodesFrom.midPeaking.gain.setValueAtTime(-40, t3);
    nodesFrom.lowShelf.gain.setValueAtTime(-40, t2);
    nodesFrom.lowShelf.gain.setValueAtTime(-40, t3);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'mids', progress: 15 }));
      addLog("Transición [1/3]: Mezclando frecuencias medias (Voces/Melodías)...");
    }, delay * 1000);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'lows', progress: 50 }));
      addLog("Transición [2/3]: Intercambiando frecuencias bajas (Bassline Swap)...");
    }, (delay + phaseDuration) * 1000);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'highs', progress: 85 }));
      addLog("Transición [3/3]: Mezclando frecuencias altas (Hats/Groove)...");
    }, (delay + 2 * phaseDuration) * 1000);

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
        nodesFrom.lowShelf.gain.value = 0;
        nodesFrom.midPeaking.gain.value = 0;
        nodesFrom.highShelf.gain.value = 0;
        nodesFrom.gainNode.gain.value = 1.0;
      } else {
        setDeckB(prev => ({
          ...prev,
          isPlaying: false,
          currentTime: 0,
          eq: { low: 0, mid: 0, high: 0 },
          volume: 1.0
        }));
        nodesFrom.lowShelf.gain.value = 0;
        nodesFrom.midPeaking.gain.value = 0;
        nodesFrom.highShelf.gain.value = 0;
        nodesFrom.gainNode.gain.value = 1.0;
      }

      const defaultEq = { low: 0, mid: 0, high: 0 };
      if (toDeckId === 'A') {
        setDeckA(prev => ({ ...prev, eq: defaultEq }));
      } else {
        setDeckB(prev => ({ ...prev, eq: defaultEq }));
      }

      addLog(`¡Mezcla completada! Deck ${toDeckId} ahora en vivo tras el DROP.`);
    }, (delay + 3 * phaseDuration) * 1000);
  };

  const checkAutoDjTransition = (playingDeckId, currentTime) => {
    if (!autoDj || transitionState.active || transitionActiveRef.current) return;
    if (transitionCheckedRef.current[playingDeckId]) return;

    const currentDeck = playingDeckId === 'A' ? deckA : deckB;
    const targetDeckId = playingDeckId === 'A' ? 'B' : 'A';

    const triggerTime = currentDeck.outroTime;
    
    if (currentTime >= triggerTime && currentTime < currentDeck.duration - 2) {
      transitionCheckedRef.current[playingDeckId] = true;
      addLog(`Auto-DJ: ¡Punto Outro alcanzado en Deck ${playingDeckId} (${triggerTime.toFixed(1)}s)!`);
      
      const compatibleTrack = findCompatibleTrack(currentDeck.track);
      
      if (compatibleTrack) {
        addLog(`Auto-DJ: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
        loadTrackIntoDeck(compatibleTrack, targetDeckId, true);
      } else {
        addLog(`Auto-DJ Advertencia: No hay canciones compatibles en la biblioteca (BPM ±1.6% y Camelot Key compatible).`);
      }
    }
  };

  const loadTrackIntoDeck = (track, deckId, startAutoTransition = false) => {
    initAudio();
    stopDeckSource(deckId);
    transitionCheckedRef.current[deckId] = false;

    nodesRef.current[deckId].buffer = track.buffer;
    nodesRef.current[deckId].pausedAt = 0;

    const rawData = track.buffer.getChannelData(0);
    const step = Math.floor(rawData.length / 300);
    const peaks = [];
    for (let i = 0; i < 300; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const val = Math.abs(rawData[i * step + j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }
    setWaveformData(prev => ({ ...prev, [deckId]: peaks }));

    const initialPitch = ((masterBpm - track.bpm) / track.bpm) * 100;
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
      introTime: track.intro
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
      nodes.pausedAt += elapsed * playbackRate;
      
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
        animationRef.current = requestAnimationFrame(updatePlaybackProgress);
        return;
      }

      if (deckA.isPlaying) {
        const nodes = nodesRef.current.A;
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const playbackRate = 1 + (nodes.pitch / 100);
        const current = nodes.pausedAt + elapsed * playbackRate;
        
        if (current >= deckA.duration) {
          handlePlaybackEnded('A');
        } else {
          setDeckA(prev => ({ ...prev, currentTime: current }));
          checkAutoDjTransition('A', current);
        }
      }

      if (deckB.isPlaying) {
        const nodes = nodesRef.current.B;
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const playbackRate = 1 + (nodes.pitch / 100);
        const current = nodes.pausedAt + elapsed * playbackRate;
        
        if (current >= deckB.duration) {
          handlePlaybackEnded('B');
        } else {
          setDeckB(prev => ({ ...prev, currentTime: current }));
          checkAutoDjTransition('B', current);
        }
      }

      animationRef.current = requestAnimationFrame(updatePlaybackProgress);
    };

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
    setAutoDj,
    autoDj,
    activeDeckId,
    setActiveDeckId,
    initAudio,
    audioCtxRef
  };
}
