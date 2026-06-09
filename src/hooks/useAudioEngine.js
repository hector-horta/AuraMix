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
    pitch: 0, // pitch fader offset (-10% to +10%)
    volume: 1.0,
    eq: { low: 0, mid: 0, high: 0 }, // values in dB (-40 to 12)
    outroTime: 0,
    introTime: 0,
    vinylMode: true
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
    vinylMode: true
  });


  const [djMode, setDjMode] = useState('autodj'); // 'manual', 'autodj', 'jukebox'
  const autoDj = djMode !== 'manual';
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
  const autoloadTimeoutRef = useRef({ A: null, B: null });

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    playedTrackIdsRef.current = playedTrackIds;
  }, [playedTrackIds]);

  useEffect(() => {
    djModeRef.current = djMode;
    if (djMode === 'manual') {
      if (autoloadTimeoutRef.current.A) {
        clearTimeout(autoloadTimeoutRef.current.A);
        autoloadTimeoutRef.current.A = null;
      }
      if (autoloadTimeoutRef.current.B) {
        clearTimeout(autoloadTimeoutRef.current.B);
        autoloadTimeoutRef.current.B = null;
      }
    }
  }, [djMode]);

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
    
    // FX Nodes for Deck A
    const fxInputA = ctx.createGain();
    const fxDryGainA = ctx.createGain();
    fxDryGainA.gain.value = 1.0;

    const filterA = ctx.createBiquadFilter();
    filterA.type = 'lowpass';
    filterA.frequency.value = 20000;
    filterA.Q.value = 1.0;

    const delayNodeA = ctx.createDelay(2.0);
    delayNodeA.delayTime.value = 0.3;
    const delayFeedbackA = ctx.createGain();
    delayFeedbackA.gain.value = 0.0;
    const delayWetA = ctx.createGain();
    delayWetA.gain.value = 0.0;

    const flangerNodeA = ctx.createDelay(0.1);
    flangerNodeA.delayTime.value = 0.005;
    const flangerLFOGainA = ctx.createGain();
    flangerLFOGainA.gain.value = 0.0;
    const flangerFeedbackA = ctx.createGain();
    flangerFeedbackA.gain.value = 0.0;
    const flangerWetA = ctx.createGain();
    flangerWetA.gain.value = 0.0;
    const flangerLFOA = ctx.createOscillator();
    flangerLFOA.type = 'sine';
    flangerLFOA.frequency.value = 1.0;

    const beatRepeatDelayA = ctx.createDelay(1.0);
    beatRepeatDelayA.delayTime.value = 0.1;
    const beatRepeatFeedbackA = ctx.createGain();
    beatRepeatFeedbackA.gain.value = 0.0;
    const beatRepeatInputGainA = ctx.createGain();
    beatRepeatInputGainA.gain.value = 1.0;
    const beatRepeatWetA = ctx.createGain();
    beatRepeatWetA.gain.value = 0.0;

    const fxOutputA = ctx.createGain();
    
    lowA.connect(midA);
    midA.connect(highA);
    highA.connect(fxInputA);
    fxInputA.connect(filterA);

    // Dry Path
    filterA.connect(fxDryGainA);
    fxDryGainA.connect(fxOutputA);

    // Delay/Echo Path
    filterA.connect(delayNodeA);
    delayNodeA.connect(delayFeedbackA);
    delayFeedbackA.connect(delayNodeA);
    delayNodeA.connect(delayWetA);
    delayWetA.connect(fxOutputA);

    // Flanger Path
    filterA.connect(flangerNodeA);
    flangerLFOA.connect(flangerLFOGainA);
    flangerLFOGainA.connect(flangerNodeA.delayTime);
    flangerNodeA.connect(flangerFeedbackA);
    flangerFeedbackA.connect(flangerNodeA);
    flangerNodeA.connect(flangerWetA);
    flangerWetA.connect(fxOutputA);

    // Beat Repeat Path
    filterA.connect(beatRepeatInputGainA);
    beatRepeatInputGainA.connect(beatRepeatDelayA);
    beatRepeatDelayA.connect(beatRepeatFeedbackA);
    beatRepeatFeedbackA.connect(beatRepeatDelayA);
    beatRepeatDelayA.connect(beatRepeatWetA);
    beatRepeatWetA.connect(fxOutputA);

    flangerLFOA.start();

    fxOutputA.connect(gainA);
    gainA.connect(ctx.destination);
    
    nodesRef.current.A = {
      ...nodesRef.current.A,
      lowShelf: lowA,
      midPeaking: midA,
      highShelf: highA,
      gainNode: gainA,
      fxInput: fxInputA,
      fxDryGain: fxDryGainA,
      filterNode: filterA,
      delayNode: delayNodeA,
      delayFeedbackNode: delayFeedbackA,
      delayWetNode: delayWetA,
      flangerNode: flangerNodeA,
      flangerLFO: flangerLFOA,
      flangerLFOGain: flangerLFOGainA,
      flangerFeedbackNode: flangerFeedbackA,
      flangerWetNode: flangerWetA,
      beatRepeatDelayNode: beatRepeatDelayA,
      beatRepeatFeedbackNode: beatRepeatFeedbackA,
      beatRepeatInputGainNode: beatRepeatInputGainA,
      beatRepeatWetNode: beatRepeatWetA,
      fxOutput: fxOutputA
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
    
    // FX Nodes for Deck B
    const fxInputB = ctx.createGain();
    const fxDryGainB = ctx.createGain();
    fxDryGainB.gain.value = 1.0;

    const filterB = ctx.createBiquadFilter();
    filterB.type = 'lowpass';
    filterB.frequency.value = 20000;
    filterB.Q.value = 1.0;

    const delayNodeB = ctx.createDelay(2.0);
    delayNodeB.delayTime.value = 0.3;
    const delayFeedbackB = ctx.createGain();
    delayFeedbackB.gain.value = 0.0;
    const delayWetB = ctx.createGain();
    delayWetB.gain.value = 0.0;

    const flangerNodeB = ctx.createDelay(0.1);
    flangerNodeB.delayTime.value = 0.005;
    const flangerLFOGainB = ctx.createGain();
    flangerLFOGainB.gain.value = 0.0;
    const flangerFeedbackB = ctx.createGain();
    flangerFeedbackB.gain.value = 0.0;
    const flangerWetB = ctx.createGain();
    flangerWetB.gain.value = 0.0;
    const flangerLFOB = ctx.createOscillator();
    flangerLFOB.type = 'sine';
    flangerLFOB.frequency.value = 1.0;

    const beatRepeatDelayB = ctx.createDelay(1.0);
    beatRepeatDelayB.delayTime.value = 0.1;
    const beatRepeatFeedbackB = ctx.createGain();
    beatRepeatFeedbackB.gain.value = 0.0;
    const beatRepeatInputGainB = ctx.createGain();
    beatRepeatInputGainB.gain.value = 1.0;
    const beatRepeatWetB = ctx.createGain();
    beatRepeatWetB.gain.value = 0.0;

    const fxOutputB = ctx.createGain();

    lowB.connect(midB);
    midB.connect(highB);
    highB.connect(fxInputB);
    fxInputB.connect(filterB);

    // Dry Path
    filterB.connect(fxDryGainB);
    fxDryGainB.connect(fxOutputB);

    // Delay/Echo Path
    filterB.connect(delayNodeB);
    delayNodeB.connect(delayFeedbackB);
    delayFeedbackB.connect(delayNodeB);
    delayNodeB.connect(delayWetB);
    delayWetB.connect(fxOutputB);

    // Flanger Path
    filterB.connect(flangerNodeB);
    flangerLFOB.connect(flangerLFOGainB);
    flangerLFOGainB.connect(flangerNodeB.delayTime);
    flangerNodeB.connect(flangerFeedbackB);
    flangerFeedbackB.connect(flangerNodeB);
    flangerNodeB.connect(flangerWetB);
    flangerWetB.connect(fxOutputB);

    // Beat Repeat Path
    filterB.connect(beatRepeatInputGainB);
    beatRepeatInputGainB.connect(beatRepeatDelayB);
    beatRepeatDelayB.connect(beatRepeatFeedbackB);
    beatRepeatFeedbackB.connect(beatRepeatDelayB);
    beatRepeatDelayB.connect(beatRepeatWetB);
    beatRepeatWetB.connect(fxOutputB);

    flangerLFOB.start();

    fxOutputB.connect(gainB);
    gainB.connect(ctx.destination);
    
    nodesRef.current.B = {
      ...nodesRef.current.B,
      lowShelf: lowB,
      midPeaking: midB,
      highShelf: highB,
      gainNode: gainB,
      fxInput: fxInputB,
      fxDryGain: fxDryGainB,
      filterNode: filterB,
      delayNode: delayNodeB,
      delayFeedbackNode: delayFeedbackB,
      delayWetNode: delayWetB,
      flangerNode: flangerNodeB,
      flangerLFO: flangerLFOB,
      flangerLFOGain: flangerLFOGainB,
      flangerFeedbackNode: flangerFeedbackB,
      flangerWetNode: flangerWetB,
      beatRepeatDelayNode: beatRepeatDelayB,
      beatRepeatFeedbackNode: beatRepeatFeedbackB,
      beatRepeatInputGainNode: beatRepeatInputGainB,
      beatRepeatWetNode: beatRepeatWetB,
      fxOutput: fxOutputB
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

  // Find a compatible track in the library (using refs to avoid stale closures in timeouts)
  const findCompatibleTrack = (currentTrack) => {
    if (!currentTrack) return null;
    
    const currentLibrary = libraryRef.current;
    const currentPlayedTrackIds = playedTrackIdsRef.current;
    const currentDjMode = djModeRef.current;

    // Get all compatible tracks (matching key & BPM within 5%)
    const compatibleTracks = currentLibrary.filter(track => {
      // Exclude current track
      if (track.id === currentTrack.id) return false;
      
      const bpmDiffPercent = Math.abs(track.bpm - currentTrack.bpm) / currentTrack.bpm;
      const bpmCompatible = currentDjMode === 'jukebox' ? true : (bpmDiffPercent <= 0.05);
      const keyCompatible = areKeysCompatible(track.key, currentTrack.key);
      
      return bpmCompatible && keyCompatible;
    });
    
    const playedRatio = currentLibrary.length > 0 ? currentPlayedTrackIds.length / currentLibrary.length : 0;
    
    const unplayedCandidates = compatibleTracks.filter(track => !currentPlayedTrackIds.includes(track.id));
    const playedCandidates = compatibleTracks.filter(track => currentPlayedTrackIds.includes(track.id));
    
    if (unplayedCandidates.length > 0) {
      return unplayedCandidates[0];
    }
    
    // Fallback to played tracks if >= 75% of the library has been played
    if (playedRatio >= 0.75 && playedCandidates.length > 0) {
      // Sort played candidates by their appearance in playedTrackIds (oldest played first)
      playedCandidates.sort((a, b) => {
        const indexA = currentPlayedTrackIds.indexOf(a.id);
        const indexB = currentPlayedTrackIds.indexOf(b.id);
        return indexA - indexB;
      });
      return playedCandidates[0];
    }
    
    return null;
  };

  // Queue a 10-second timer to autoload a compatible track in a stopped deck
  const queueAutoloadForDeck = (stoppedDeckId, currentActiveTrack) => {
    if (djModeRef.current === 'manual') return;

    // Clear any existing timer for this deck
    if (autoloadTimeoutRef.current[stoppedDeckId]) {
      clearTimeout(autoloadTimeoutRef.current[stoppedDeckId]);
    }

    addLog(`Auto-DJ: Esperando 10 segundos para pre-cargar canción compatible en Deck ${stoppedDeckId}...`);

    autoloadTimeoutRef.current[stoppedDeckId] = setTimeout(() => {
      const compatibleTrack = findCompatibleTrack(currentActiveTrack);
      if (compatibleTrack) {
        addLog(`Auto-DJ (10s): Cargando automáticamente tema preparado "${compatibleTrack.title}" en Deck ${stoppedDeckId}.`);
        loadTrackIntoDeck(compatibleTrack, stoppedDeckId, false, true);
      } else {
        addLog(`Auto-DJ (10s) Info: No se encontró tema compatible en la biblioteca para pre-cargar en Deck ${stoppedDeckId}.`);
      }
      autoloadTimeoutRef.current[stoppedDeckId] = null;
    }, 10000);
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
    
    // In Jukebox mode, the incoming track plays at its natural tempo (pitchOffset = 0)
    const pitchOffset = djMode === 'jukebox' ? 0 : (targetTrack ? (((masterBpm - targetTrack.bpm) / targetTrack.bpm) * 100) : 0);
    
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
    
    if (djMode === 'jukebox') {
      addLog(`Alineando tempo (Modo Jukebox): Deck ${toDeckId} a velocidad original (${targetTrack?.bpm} BPM)`);
      // Keep EQ filters flat (0dB)
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
    const outroTimeFrom = fromDeckId === 'A' ? deckA.outroTime : deckB.outroTime;
    const remainingTime = Math.max(2, currentDeckDuration - (highPrecisionTime + delay));
    
    // Transition duration = min(outro duration of outgoing track, intro duration of incoming track)
    const outroDuration = Math.max(10, currentDeckDuration - outroTimeFrom);
    const introDuration = incomingTrack ? Math.max(10, incomingTrack.intro) : 90;
    const idealTransitionDuration = Math.min(outroDuration, introDuration);
    const transitionDuration = Math.min(idealTransitionDuration, remainingTime);
    const phaseDuration = transitionDuration / 3;
    const fromDeckVolume = fromDeckId === 'A' ? deckA.volume : deckB.volume;
    
    addLog(`Duración de mezcla: ${transitionDuration.toFixed(1)}s (outro saliente: ${outroDuration.toFixed(1)}s, intro entrante: ${introDuration.toFixed(1)}s) — 3 fases de ${phaseDuration.toFixed(1)}s.`);

    const t0 = startTime;
    const t1 = t0 + phaseDuration;
    const t2 = t0 + 2 * phaseDuration;
    const t3 = t0 + 3 * phaseDuration;

    if (djMode === 'jukebox') {
      // Jukebox: Crossfade volumes
      nodesTo.gainNode.gain.setValueAtTime(0.0, t0);
      nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t3);
      nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t0);
      nodesFrom.gainNode.gain.linearRampToValueAtTime(0.0, t3);
      
      // Pitch ramp for outgoing track to match incoming track's BPM
      if (nodesFrom.source && targetTrack) {
        nodesFrom.source.playbackRate.setValueAtTime(playbackRateFrom, t0);
        nodesFrom.source.playbackRate.linearRampToValueAtTime(targetTrack.bpm / fromBpm, t3);
      }
    } else {
      // Standard Auto-DJ: Constant volume transition
      nodesTo.gainNode.gain.setValueAtTime(1.0, t0);
      nodesTo.gainNode.gain.setValueAtTime(1.0, t3);
      nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t0);
      nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t3);
    }

    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, volume: 1.0 }));
    } else {
      setDeckB(prev => ({ ...prev, volume: 1.0 }));
    }

    const times = [t0, t1, t2, t3];
    const BAND_NODES = {
      low: 'lowShelf',
      mid: 'midPeaking',
      high: 'highShelf'
    };

    if (djMode !== 'jukebox') {
      // Schedule EQs dynamically for each of the 3 phases
      for (let p = 0; p < 3; p++) {
        const startTimePhase = times[p];
        const endTimePhase = times[p + 1];

        eqOrder.forEach((band, j) => {
          const nodeFrom = nodesFrom[BAND_NODES[band]];
          const nodeTo = nodesTo[BAND_NODES[band]];
          const initialVal = fromDeckId === 'A' ? deckA.eq[band] : deckB.eq[band];

          if (j === p) {
            // This band swaps in this phase
            nodeFrom.gain.setValueAtTime(initialVal, startTimePhase);
            nodeFrom.gain.linearRampToValueAtTime(-40, endTimePhase);
            
            nodeTo.gain.setValueAtTime(-40, startTimePhase);
            nodeTo.gain.linearRampToValueAtTime(0, endTimePhase);
          } else if (j < p) {
            // Already swapped, stays at swapped values
            nodeFrom.gain.setValueAtTime(-40, startTimePhase);
            nodeFrom.gain.setValueAtTime(-40, endTimePhase);
            
            nodeTo.gain.setValueAtTime(0, startTimePhase);
            nodeTo.gain.setValueAtTime(0, endTimePhase);
          } else {
            // Not yet swapped, stays at initial values
            nodeFrom.gain.setValueAtTime(initialVal, startTimePhase);
            nodeFrom.gain.setValueAtTime(initialVal, endTimePhase);
            
            nodeTo.gain.setValueAtTime(-40, startTimePhase);
            nodeTo.gain.setValueAtTime(-40, endTimePhase);
          }
        });
      }
    }

    const bandDetails = {
      mid: { phase: 'mids', msg: "Mezclando frecuencias medias (Voces/Melodías)..." },
      low: { phase: 'lows', msg: "Intercambiando frecuencias bajas (Bassline Swap)..." },
      high: { phase: 'highs', msg: "Mezclando frecuencias altas (Hats/Groove)..." }
    };

    if (djMode === 'jukebox') {
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

        // Set EQs to flat
        const defaultEq = { low: 0, mid: 0, high: 0 };
        if (toDeckId === 'A') {
          setDeckA(prev => ({ ...prev, eq: defaultEq }));
        } else {
          setDeckB(prev => ({ ...prev, eq: defaultEq }));
        }

        // Update Master BPM to match the new track
        if (targetTrack) {
          changeMasterBpm(targetTrack.bpm);
        }
        addLog(`¡Mezcla Jukebox completada! Deck ${toDeckId} ahora en vivo a ${targetTrack?.bpm} BPM.`);
        queueAutoloadForDeck(fromDeckId, targetTrack);
      }, (delay + transitionDuration) * 1000);
    } else {
      setTimeout(() => {
        const b = eqOrder[0];
        setTransitionState(prev => ({ ...prev, phase: bandDetails[b].phase, progress: 15 }));
        addLog(`Transición [1/3]: ${bandDetails[b].msg}`);
      }, delay * 1000);

      setTimeout(() => {
        const b = eqOrder[1];
        setTransitionState(prev => ({ ...prev, phase: bandDetails[b].phase, progress: 50 }));
        addLog(`Transición [2/3]: ${bandDetails[b].msg}`);
      }, (delay + phaseDuration) * 1000);

      setTimeout(() => {
        const b = eqOrder[2];
        setTransitionState(prev => ({ ...prev, phase: bandDetails[b].phase, progress: 85 }));
        addLog(`Transición [3/3]: ${bandDetails[b].msg}`);
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
        queueAutoloadForDeck(fromDeckId, targetTrack);
      }, (delay + 3 * phaseDuration) * 1000);
    }
  };

  const checkAutoDjTransition = (playingDeckId, currentTime) => {
    if (!autoDj || transitionState.active || transitionActiveRef.current) return;
    if (transitionCheckedRef.current[playingDeckId]) return;

    const currentDeck = playingDeckId === 'A' ? deckA : deckB;
    const targetDeckId = playingDeckId === 'A' ? 'B' : 'A';
    const targetDeck = targetDeckId === 'A' ? deckA : deckB;

    const triggerTime = currentDeck.outroTime;
    
    if (currentTime >= triggerTime && currentTime < currentDeck.duration - 2) {
      transitionCheckedRef.current[playingDeckId] = true;
      addLog(`Auto-DJ: ¡Punto Outro alcanzado en Deck ${playingDeckId} (${triggerTime.toFixed(1)}s)!`);
      
      if (targetDeck.track) {
        addLog(`Auto-DJ: Usando canción cargada manualmente "${targetDeck.track.title}" en Deck ${targetDeckId} para la mezcla.`);
        triggerAutomatedTransition(playingDeckId, targetDeckId, targetDeck.track);
      } else {
        const compatibleTrack = findCompatibleTrack(currentDeck.track);
        
        if (compatibleTrack) {
          addLog(`Auto-DJ: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
          loadTrackIntoDeck(compatibleTrack, targetDeckId, true);
        } else {
          addLog(`Auto-DJ Advertencia: No hay canciones compatibles en la biblioteca (BPM ±5.0% y Camelot Key compatible) para mezclar automáticamente.`);
        }
      }
    }
  };

  const loadTrackIntoDeck = (track, deckId, startAutoTransition = false, isAutoload = false) => {
    initAudio();
    stopDeckSource(deckId);
    transitionCheckedRef.current[deckId] = false;

    // If loaded manually by user, clear any pending autoload timer for this deck
    if (!isAutoload && autoloadTimeoutRef.current[deckId]) {
      clearTimeout(autoloadTimeoutRef.current[deckId]);
      autoloadTimeoutRef.current[deckId] = null;
      addLog(`Auto-DJ: Cancelado pre-cargado automático en Deck ${deckId} debido a carga manual.`);
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
      introTime: track.intro,
      vinylMode: deckId === 'A' ? deckA.vinylMode : deckB.vinylMode
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
        const current = nodes.pausedAt + elapsed * playbackRate;
        
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

  const updateFx = (active, type, x, y, isInitialTouch = false) => {
    setFxState({ active, type, x, y });
    
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const deckId = activeDeckId;
    const nodes = nodesRef.current[deckId];
    
    if (!nodes.fxInput) return;
    
    if (!active) {
      // Deactivate all effects
      nodes.filterNode.type = 'lowpass';
      nodes.filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
      nodes.filterNode.Q.setValueAtTime(1.0, ctx.currentTime);
      
      nodes.delayWetNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.delayFeedbackNode.gain.setValueAtTime(0.0, ctx.currentTime);
      
      nodes.flangerWetNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.flangerFeedbackNode.gain.setValueAtTime(0.0, ctx.currentTime);
      
      nodes.beatRepeatInputGainNode.gain.setValueAtTime(1.0, ctx.currentTime);
      nodes.beatRepeatFeedbackNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.beatRepeatWetNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.fxDryGain.gain.setValueAtTime(1.0, ctx.currentTime);
      
      if (nodes.source) {
        nodes.source.playbackRate.cancelScheduledValues(ctx.currentTime);
        nodes.source.playbackRate.setValueAtTime(nodes.source.playbackRate.value, ctx.currentTime);
        nodes.source.playbackRate.linearRampToValueAtTime(1 + (nodes.pitch / 100), ctx.currentTime + 0.3);
      }
      return;
    }
    
    // Configure specific active effect
    if (type === 'Filter') {
      if (x < 0.45) {
        nodes.filterNode.type = 'lowpass';
        const freq = 20 + (x / 0.45) * 19980;
        nodes.filterNode.frequency.setValueAtTime(freq, ctx.currentTime);
      } else if (x > 0.55) {
        nodes.filterNode.type = 'highpass';
        const freq = 20 + ((x - 0.55) / 0.45) * 19980;
        nodes.filterNode.frequency.setValueAtTime(freq, ctx.currentTime);
      } else {
        nodes.filterNode.type = 'lowpass';
        nodes.filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
      }
      nodes.filterNode.Q.setValueAtTime(y * 15, ctx.currentTime);
    } else {
      nodes.filterNode.type = 'lowpass';
      nodes.filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
    }
    
    if (type === 'Delay') {
      const time = 0.01 + x * 0.99;
      const fb = y * 0.9;
      nodes.delayNode.delayTime.setValueAtTime(time, ctx.currentTime);
      nodes.delayFeedbackNode.gain.setValueAtTime(fb, ctx.currentTime);
      nodes.delayWetNode.gain.setValueAtTime(0.5, ctx.currentTime);
      nodes.fxDryGain.gain.setValueAtTime(1.0, ctx.currentTime);
    } else if (type === 'Echo') {
      const time = 0.2 + x * 1.8;
      const mix = y;
      nodes.delayNode.delayTime.setValueAtTime(time, ctx.currentTime);
      nodes.delayFeedbackNode.gain.setValueAtTime(0.6, ctx.currentTime);
      nodes.delayWetNode.gain.setValueAtTime(mix, ctx.currentTime);
      nodes.fxDryGain.gain.setValueAtTime(1.0 - mix * 0.5, ctx.currentTime);
    } else {
      nodes.delayWetNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.delayFeedbackNode.gain.setValueAtTime(0.0, ctx.currentTime);
    }
    
    if (type === 'Flanger') {
      const rate = 0.1 + x * 4.9;
      const depth = y * 0.01;
      nodes.flangerLFO.frequency.setValueAtTime(rate, ctx.currentTime);
      nodes.flangerLFOGain.gain.setValueAtTime(depth, ctx.currentTime);
      nodes.flangerFeedbackNode.gain.setValueAtTime(0.7, ctx.currentTime);
      nodes.flangerWetNode.gain.setValueAtTime(0.5, ctx.currentTime);
      nodes.fxDryGain.gain.setValueAtTime(1.0, ctx.currentTime);
    } else {
      nodes.flangerWetNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.flangerFeedbackNode.gain.setValueAtTime(0.0, ctx.currentTime);
    }
    
    if (type === 'Beat Repeat') {
      const beatDuration = 60 / masterBpm;
      let div = 0.25;
      if (x < 0.2) div = 0.25;
      else if (x < 0.4) div = 0.125;
      else if (x < 0.6) div = 0.0625;
      else if (x < 0.8) div = 0.03125;
      else div = 0.015625;
      
      const time = beatDuration * div;
      nodes.beatRepeatDelayNode.delayTime.setValueAtTime(time, ctx.currentTime);
      
      if (isInitialTouch) {
        nodes.beatRepeatInputGainNode.gain.setValueAtTime(0.0, ctx.currentTime);
        nodes.beatRepeatFeedbackNode.gain.setValueAtTime(0.999, ctx.currentTime);
      }
      
      const mix = y;
      nodes.beatRepeatWetNode.gain.setValueAtTime(mix, ctx.currentTime);
      nodes.fxDryGain.gain.setValueAtTime(1.0 - mix, ctx.currentTime);
    } else {
      nodes.beatRepeatInputGainNode.gain.setValueAtTime(1.0, ctx.currentTime);
      nodes.beatRepeatFeedbackNode.gain.setValueAtTime(0.0, ctx.currentTime);
      nodes.beatRepeatWetNode.gain.setValueAtTime(0.0, ctx.currentTime);
      if (type !== 'Echo') {
        nodes.fxDryGain.gain.setValueAtTime(1.0, ctx.currentTime);
      }
    }
    
    if (type === 'Tape Stop') {
      const stopDuration = 0.1 + x * 2.0;
      if (nodes.source) {
        nodes.source.playbackRate.cancelScheduledValues(ctx.currentTime);
        nodes.source.playbackRate.setValueAtTime(nodes.source.playbackRate.value, ctx.currentTime);
        nodes.source.playbackRate.linearRampToValueAtTime(0.0001, ctx.currentTime + stopDuration);
      }
    }
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
    if (!nodes.buffer) return;

    if (deck.vinylMode && isUpperHalf) {
      isScratchingRef.current[deckId] = true;
      dragModeRef.current[deckId] = 'scratch';
      lastXRef.current[deckId] = clientX;
      lastTimeRef.current[deckId] = performance.now();

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
    } else {
      dragModeRef.current[deckId] = 'bend';
      lastXRef.current[deckId] = clientX;
      lastTimeRef.current[deckId] = performance.now();
    }
  };

  const updateScratch = (deckId, clientX, width) => {
    if (transitionState.active) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];
    if (!nodes.buffer || !nodes.source) return;

    const dragMode = dragModeRef.current[deckId];
    if (!dragMode) return;

    const dx = clientX - lastXRef.current[deckId];
    lastXRef.current[deckId] = clientX;

    const now = performance.now();
    const dt = (now - lastTimeRef.current[deckId]) / 1000;
    lastTimeRef.current[deckId] = now;

    if (dragMode === 'scratch' && isScratchingRef.current[deckId]) {
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

        if (deckId === 'A') {
          setDeckA(prev => ({ ...prev, currentTime: newTime }));
        } else {
          setDeckB(prev => ({ ...prev, currentTime: newTime }));
        }
      }
    } else if (dragMode === 'bend') {
      const sensitivity = 0.5;
      const bendFactor = (dx / width) * sensitivity;
      const normalRate = 1 + (nodes.pitch / 100);
      let targetRate = normalRate + bendFactor;
      targetRate = Math.max(0.5, Math.min(1.5, targetRate));

      nodes.source.playbackRate.value = targetRate;

      if (bendTimeoutRef.current[deckId]) {
        clearTimeout(bendTimeoutRef.current[deckId]);
      }
      bendTimeoutRef.current[deckId] = setTimeout(() => {
        if (nodes.source && dragModeRef.current[deckId] === 'bend') {
          nodes.source.playbackRate.value = normalRate;
        }
      }, 100);
    }
  };

  const stopScratch = (deckId, isQuickClick, clickPercent) => {
    if (transitionState.active) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const deck = deckId === 'A' ? deckA : deckB;
    const nodes = nodesRef.current[deckId];
    if (!nodes.buffer) return;

    const dragMode = dragModeRef.current[deckId];
    
    if (isQuickClick) {
      seekTo(deckId, clickPercent);
    } else {
      if (dragMode === 'scratch') {
        isScratchingRef.current[deckId] = false;
        
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

    dragModeRef.current[deckId] = null;
    isScratchingRef.current[deckId] = false;
    if (bendTimeoutRef.current[deckId]) {
      clearTimeout(bendTimeoutRef.current[deckId]);
      bendTimeoutRef.current[deckId] = null;
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
    stopScratch
  };
}
