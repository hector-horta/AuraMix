import React, { useState, useEffect, useRef } from 'react'
import { 
  Play, Pause, SkipForward, Upload, Music, Sliders, 
  Volume2, Disc, Check, AlertCircle, Trash2, FolderOpen, RefreshCw 
} from 'lucide-react'
import { 
  decodeAudioFile, decodeAudioFromUrl, detectBPM, detectKey, detectOutro, detectIntro, areKeysCompatible 
} from './utils/audioAnalyzer'

// Initial Demo Tracks (Served locally to prevent CORS blocks)
const DEMO_TRACKS = [
  {
    id: 'demo-1',
    title: 'House Groovy Loop A',
    artist: 'SoundMonster CC0',
    url: '/house-loop.wav',
    bpm: 125,
    key: '8A',
    outro: 12.0,
    isDemo: true
  },
  {
    id: 'demo-2',
    title: 'House Groovy Loop B (Compat)',
    artist: 'SoundMonster CC0',
    url: '/house-loop.wav',
    bpm: 125,
    key: '8A',
    outro: 12.0,
    isDemo: true
  },
  {
    id: 'demo-3',
    title: 'Electronic Beat (Incompat)',
    artist: 'SoundMonster CC0',
    url: '/electronic-loop.wav',
    bpm: 128,
    key: '5A',
    outro: 15.0,
    isDemo: true
  }
];

export default function App() {
  // --- STATE ---
  const [library, setLibrary] = useState([]);
  const [analyzingFile, setAnalyzingFile] = useState(null);
  const [analyzingProgress, setAnalyzingProgress] = useState("");
  
  // Decks State
  const [deckA, setDeckA] = useState({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0, // pitch fader offset (-1.6% to +1.6% standard, we allow up to +/- 5% for utility)
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

  const [crossfader, setCrossfader] = useState(0); // -1 (Deck A) to +1 (Deck B)
  const [autoDj, setAutoDj] = useState(true);
  const [djLogs, setDjLogs] = useState(["DJ Engine listo. Carga canciones para comenzar."]);
  const [activeDeckId, setActiveDeckId] = useState('A'); // 'A' or 'B'
  const [transitionState, setTransitionState] = useState({
    active: false,
    phase: 'idle', // 'idle', 'aligning', 'volume', 'mids', 'highs', 'lows', 'boost'
    progress: 0
  });

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
      pausedAt: 0
    },
    B: {
      source: null,
      buffer: null,
      lowShelf: null,
      midPeaking: null,
      highShelf: null,
      gainNode: null,
      startTime: 0,
      pausedAt: 0
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

  const addLog = (msg) => {
    setDjLogs(prev => [msg, ...prev.slice(0, 19)]);
  };

  // --- PLAYBACK MONITORING LOOP ---
  useEffect(() => {
    const updatePlaybackProgress = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) {
        animationRef.current = requestAnimationFrame(updatePlaybackProgress);
        return;
      }

      // Update Deck A Time
      if (deckA.isPlaying) {
        const elapsed = ctx.currentTime - nodesRef.current.A.startTime;
        const current = nodesRef.current.A.pausedAt + elapsed;
        
        if (current >= deckA.duration) {
          handlePlaybackEnded('A');
        } else {
          setDeckA(prev => ({ ...prev, currentTime: current }));
          // Auto-DJ check
          checkAutoDjTransition('A', current);
        }
      }

      // Update Deck B Time
      if (deckB.isPlaying) {
        const elapsed = ctx.currentTime - nodesRef.current.B.startTime;
        const current = nodesRef.current.B.pausedAt + elapsed;
        
        if (current >= deckB.duration) {
          handlePlaybackEnded('B');
        } else {
          setDeckB(prev => ({ ...prev, currentTime: current }));
          // Auto-DJ check
          checkAutoDjTransition('B', current);
        }
      }

      animationRef.current = requestAnimationFrame(updatePlaybackProgress);
    };

    animationRef.current = requestAnimationFrame(updatePlaybackProgress);
    return () => cancelAnimationFrame(animationRef.current);
  }, [deckA.isPlaying, deckA.duration, deckB.isPlaying, deckB.duration, autoDj, transitionState.active]);

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

  // --- AUTOMATED TRANSITION TRIGGERS ---
  const checkAutoDjTransition = (playingDeckId, currentTime) => {
    if (!autoDj || transitionState.active) return;

    const currentDeck = playingDeckId === 'A' ? deckA : deckB;
    const targetDeckId = playingDeckId === 'A' ? 'B' : 'A';
    const targetDeck = playingDeckId === 'A' ? deckB : deckA;

    // Trigger transition when we reach the outro point (or 10 seconds before end as safety)
    const triggerTime = currentDeck.outroTime;
    
    if (currentTime >= triggerTime && currentTime < currentDeck.duration - 2) {
      addLog(`Auto-DJ: ¡Punto Outro alcanzado en Deck ${playingDeckId} (${triggerTime.toFixed(1)}s)!`);
      
      // Look for a compatible track for targetDeck
      const compatibleTrack = findCompatibleTrack(currentDeck.track);
      
      if (compatibleTrack) {
        addLog(`Auto-DJ: Cargando canción compatible "${compatibleTrack.title}" en Deck ${targetDeckId}.`);
        loadTrackIntoDeck(compatibleTrack, targetDeckId, true); // Load and start transition!
      } else {
        addLog(`Auto-DJ Advertencia: No hay canciones compatibles en la biblioteca (BPM ±1.6% y Camelot Key compatible).`);
      }
    }
  };

  // Find a compatible track in the library
  const findCompatibleTrack = (currentTrack) => {
    if (!currentTrack) return null;
    
    return library.find(track => {
      // Don't mix into the exact same track file if others are available
      if (track.id === currentTrack.id && library.length > 1) return false;
      
      // 1. BPM check: must be within +/- 1.6%
      const bpmDiffPercent = Math.abs(track.bpm - currentTrack.bpm) / currentTrack.bpm;
      const bpmCompatible = bpmDiffPercent <= 0.016;

      // 2. Key check: Camelot compatibility
      const keyCompatible = areKeysCompatible(track.key, currentTrack.key);

      return bpmCompatible && keyCompatible;
    });
  };

  // Trigger the multi-phase EQ Transition
  const triggerAutomatedTransition = (fromDeckId, toDeckId, incomingTrack) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    setTransitionState({
      active: true,
      phase: 'aligning',
      progress: 0
    });

    addLog(`Iniciando mezcla automática: Deck ${fromDeckId} ➔ Deck ${toDeckId}`);
    
    const nodesFrom = nodesRef.current[fromDeckId];
    const nodesTo = nodesRef.current[toDeckId];

    // Ensure incoming deck is playing at the correct matched BPM
    const fromBpm = fromDeckId === 'A' ? deckA.track.bpm : deckB.track.bpm;
    const toBpm = fromDeckId === 'A' ? deckB.track.bpm : deckA.track.bpm;
    
    // Calculate required speed shift for target deck
    const pitchOffset = ((fromBpm - toBpm) / toBpm) * 100;
    
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
    
    addLog(`Alineando tempo: Sincronizando Deck ${toDeckId} a ${fromBpm} BPM (${pitchOffset > 0 ? '+' : ''}${pitchOffset.toFixed(2)}% de velocidad)`);

    // Reset EQ nodes to baseline for incoming track
    // Start with all frequencies cut (low=-40dB, mid=-40dB, high=-40dB)
    nodesTo.lowShelf.gain.value = -40;
    nodesTo.midPeaking.gain.value = -40;
    nodesTo.highShelf.gain.value = -40;

    // Reset EQ state representation in UI
    const targetEqUpdate = { low: -40, mid: -40, high: -40 };
    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, eq: targetEqUpdate }));
    } else {
      setDeckB(prev => ({ ...prev, eq: targetEqUpdate }));
    }

    // --- BEAT GRID ALIGNMENT ---
    // Calculate high-precision playback position of the active deck using AudioContext clock to avoid React render lag
    const elapsedSinceStart = ctx.currentTime - nodesFrom.startTime;
    const highPrecisionTime = nodesFrom.pausedAt + elapsedSinceStart;

    // Calculate beat spacing in seconds for the active track
    const beatDuration = 60 / fromBpm;
    
    // Calculate phase offset within the current beat
    const beatOffset = highPrecisionTime % beatDuration;
    // Delay launch of target deck to land precisely on the next beat boundary
    const delay = beatDuration - beatOffset;
    
    const startTime = ctx.currentTime + delay;

    // Start playing the incoming track beat-aligned, immediately using the calculated target pitch
    playDeckSource(toDeckId, startTime, pitchOffset);
    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, isPlaying: true }));
      nodesRef.current.A.pausedAt = 0;
    } else {
      setDeckB(prev => ({ ...prev, isPlaying: true }));
      nodesRef.current.B.pausedAt = 0;
    }

    addLog(`Alineación rítmica: Lanzando Deck ${toDeckId} en el próximo golpe (+${(delay * 1000).toFixed(0)}ms)`);

    // --- DYNAMIC TRANSITION TIMES & HEADROOM SCHEDULING ---
    const transitionDuration = incomingTrack ? incomingTrack.intro : 16;
    const phaseDuration = transitionDuration / 5;
    const fromDeckVolume = fromDeckId === 'A' ? deckA.volume : deckB.volume;
    
    addLog(`Alineación del Drop: Mezcla automática en 5 fases - Duración total: ${transitionDuration.toFixed(1)}s (Intro).`);

    const t0 = startTime;
    const t1 = t0 + phaseDuration;
    const t2 = t0 + 2 * phaseDuration;
    const t3 = t0 + 3 * phaseDuration;
    const t4 = t0 + 4 * phaseDuration;
    const t5 = t0 + 5 * phaseDuration;

    // --- PHASED VOLUME AUTOMATION ---
    // Phase 1: Incoming volume ramps 0 -> 100% (1.0). Outgoing volume remains at baseline.
    nodesTo.gainNode.gain.setValueAtTime(0.0, t0);
    nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t1);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t0);
    nodesFrom.gainNode.gain.linearRampToValueAtTime(fromDeckVolume, t1);

    // Phase 2: Mids swap (Melodies/Vocals). Volumes hold at 100% to preserve constant momentum.
    nodesTo.gainNode.gain.setValueAtTime(1.0, t1);
    nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t2);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t1);
    nodesFrom.gainNode.gain.linearRampToValueAtTime(fromDeckVolume, t2);

    // Phase 3: Highs swap (Hats/Groove). Volumes hold at 100% to preserve constant momentum.
    nodesTo.gainNode.gain.setValueAtTime(1.0, t2);
    nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t3);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t2);
    nodesFrom.gainNode.gain.linearRampToValueAtTime(fromDeckVolume, t3);

    // Phase 4: Lows swap (Bassline swap). Volumes hold at 100% to preserve constant momentum.
    nodesTo.gainNode.gain.setValueAtTime(1.0, t3);
    nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t4);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t3);
    nodesFrom.gainNode.gain.linearRampToValueAtTime(fromDeckVolume, t4);

    // Phase 5: Volume Crossover (Outgoing fades 100% -> 0% in parallel with incoming track staying constant at 100%).
    // Keeping the incoming track fader constant at 1.0 ensures the overall output volume is fully preserved at the drop.
    nodesTo.gainNode.gain.setValueAtTime(1.0, t4);
    nodesTo.gainNode.gain.linearRampToValueAtTime(1.0, t5);
    nodesFrom.gainNode.gain.setValueAtTime(fromDeckVolume, t4);
    nodesFrom.gainNode.gain.linearRampToValueAtTime(0.0, t5);

    // Update UI state for volumes
    if (toDeckId === 'A') {
      setDeckA(prev => ({ ...prev, volume: 1.0 }));
    } else {
      setDeckB(prev => ({ ...prev, volume: 1.0 }));
    }

    // --- EQ SWAP AUTOMATION ---
    // Phase 2: Mids Swap (sweeps B to normal, A to -40dB)
    nodesFrom.midPeaking.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.mid : deckB.eq.mid, t1);
    nodesFrom.midPeaking.gain.linearRampToValueAtTime(-40, t2);
    nodesTo.midPeaking.gain.setValueAtTime(-40, t1);
    nodesTo.midPeaking.gain.linearRampToValueAtTime(0, t2);

    // Phase 3: Highs Swap (sweeps B to normal, A to -40dB)
    nodesFrom.highShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.high : deckB.eq.high, t2);
    nodesFrom.highShelf.gain.linearRampToValueAtTime(-40, t3);
    nodesTo.highShelf.gain.setValueAtTime(-40, t2);
    nodesTo.highShelf.gain.linearRampToValueAtTime(0, t3);

    // Phase 4: Lows/Bass Swap (sweeps B to normal, A to -40dB)
    nodesFrom.lowShelf.gain.setValueAtTime(fromDeckId === 'A' ? deckA.eq.low : deckB.eq.low, t3);
    nodesFrom.lowShelf.gain.linearRampToValueAtTime(-40, t4);
    nodesTo.lowShelf.gain.setValueAtTime(-40, t3);
    nodesTo.lowShelf.gain.linearRampToValueAtTime(0, t4);

    // --- UI SCHEDULING TIMEOUTS ---
    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'volume', progress: 20 }));
      addLog("Transición [1/5]: Subiendo volumen de canal entrante a 100% (EQs silenciados)...");
    }, delay * 1000);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'mids', progress: 40 }));
      addLog("Transición [2/5]: Mezclando frecuencias medias (Voces/Melodías)...");
    }, (delay + phaseDuration) * 1000);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'highs', progress: 60 }));
      addLog("Transición [3/5]: Mezclando frecuencias altas (Hats/Groove)...");
    }, (delay + 2 * phaseDuration) * 1000);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'lows', progress: 80 }));
      addLog("Transición [4/5]: Intercambiando frecuencias bajas (Bassline Swap)...");
    }, (delay + 3 * phaseDuration) * 1000);

    setTimeout(() => {
      setTransitionState(prev => ({ ...prev, phase: 'crossover', progress: 95 }));
      addLog("Transición [5/5]: Desvaneciendo canal saliente (Saliente ➔ 0%, Entrante constante a 100%)...");
    }, (delay + 4 * phaseDuration) * 1000);

    setTimeout(() => {
      // Finalize Transition
      setTransitionState({ active: false, phase: 'idle', progress: 0 });
      setActiveDeckId(toDeckId);
      
      // Stop old deck
      stopDeckSource(fromDeckId);
      if (fromDeckId === 'A') {
        setDeckA(prev => ({
          ...prev,
          isPlaying: false,
          currentTime: 0,
          eq: { low: 0, mid: 0, high: 0 },
          volume: 1.0
        }));
        // Reset node parameters to flat
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

      // Restore target deck EQs fully in State representation
      const defaultEq = { low: 0, mid: 0, high: 0 };
      if (toDeckId === 'A') {
        setDeckA(prev => ({ ...prev, eq: defaultEq }));
      } else {
        setDeckB(prev => ({ ...prev, eq: defaultEq }));
      }

      // Adjust crossfader slider visually
      setCrossfader(toDeckId === 'A' ? -1 : 1);

      addLog(`¡Mezcla completada! Deck ${toDeckId} ahora en vivo tras el DROP.`);
    }, (delay + 5 * phaseDuration) * 1000);
  };

  // --- AUDIO FILE UPLOAD & ANALYSIS ---
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    initAudio();
    const ctx = audioCtxRef.current;

    for (const file of files) {
      setAnalyzingFile(file.name);
      setAnalyzingProgress("Cargando y decodificando audio...");
      addLog(`Cargando archivo: "${file.name}"...`);

      try {
        const decodedBuffer = await decodeAudioFile(file, ctx);
        
        setAnalyzingProgress("Analizando tempo (BPM)...");
        const bpm = await detectBPM(decodedBuffer);
        
        setAnalyzingProgress("Detectando escala musical...");
        const keyData = await detectKey(decodedBuffer);
        
        setAnalyzingProgress("Detectando punto de salida (Outro)...");
        const outroTime = detectOutro(decodedBuffer);

        setAnalyzingProgress("Detectando punto de entrada (Intro)...");
        const introTime = detectIntro(decodedBuffer, bpm);

        const newTrack = {
          id: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          title: file.name.replace(/\.[^/.]+$/, ""), // Strip extension
          artist: 'Archivo Local',
          bpm: bpm,
          key: keyData.camelot,
          keyName: keyData.keyName,
          outro: outroTime,
          intro: introTime,
          duration: decodedBuffer.duration,
          buffer: decodedBuffer,
          isDemo: false
        };

        setLibrary(prev => [...prev, newTrack]);
        addLog(`Analizado con éxito: "${newTrack.title}" (${bpm} BPM, Tono: ${keyData.camelot}, Intro/Drop: ${introTime.toFixed(1)}s, Outro: ${outroTime.toFixed(1)}s)`);
      } catch (err) {
        console.error(err);
        addLog(`Error analizando "${file.name}": ${err.message}`);
      }
    }
    
    setAnalyzingFile(null);
    setAnalyzingProgress("");
  };

  // Load a demo track from URL
  const loadDemoTrack = async (demoTrack) => {
    initAudio();
    const ctx = audioCtxRef.current;
    
    setAnalyzingFile(demoTrack.title);
    setAnalyzingProgress("Descargando de internet y decodificando...");
    addLog(`Cargando pista demo: "${demoTrack.title}"...`);

    try {
      const decodedBuffer = await decodeAudioFromUrl(demoTrack.url, ctx);
      
      setAnalyzingProgress("Analizando tempo (BPM)...");
      const bpm = await detectBPM(decodedBuffer);
      
      setAnalyzingProgress("Analizando tono (Camelot)...");
      const keyData = await detectKey(decodedBuffer);
      
      setAnalyzingProgress("Analizando outro...");
      const outroTime = detectOutro(decodedBuffer);

      setAnalyzingProgress("Analizando intro...");
      const introTime = detectIntro(decodedBuffer, bpm);

      const analyzedTrack = {
        ...demoTrack,
        bpm: bpm,
        key: keyData.camelot,
        keyName: keyData.keyName,
        outro: outroTime,
        intro: introTime,
        duration: decodedBuffer.duration,
        buffer: decodedBuffer
      };

      setLibrary(prev => {
        // Remove existing demo with same ID if exists
        const cleaned = prev.filter(t => t.id !== demoTrack.id);
        return [...cleaned, analyzedTrack];
      });

      addLog(`Demo cargada con éxito: "${analyzedTrack.title}" (${bpm} BPM, Tono: ${keyData.camelot}, Intro/Drop: ${introTime.toFixed(1)}s, Outro: ${outroTime.toFixed(1)}s)`);
    } catch (err) {
      console.error(err);
      addLog(`Error cargando demo: ${err.message}. Intentando fallback local.`);
      // If CORS blocks it, make a placeholder buffer with silence so the app structure doesn't crash,
      // but warn the user.
      addLog(`Consejo: Sube tus propios archivos MP3 locales arrastrándolos aquí para saltar las restricciones de CORS.`);
    }
    
    setAnalyzingFile(null);
    setAnalyzingProgress("");
  };

  // Load all 3 demo tracks
  const loadAllDemos = async () => {
    for (const track of DEMO_TRACKS) {
      await loadDemoTrack(track);
    }
  };

  // Delete track from library
  const deleteTrack = (id, e) => {
    e.stopPropagation();
    setLibrary(prev => prev.filter(t => t.id !== id));
  };

  // --- LOAD TRACK INTO DECK ---
  const loadTrackIntoDeck = (track, deckId, startAutoTransition = false) => {
    initAudio();
    
    // Stop current play if active
    stopDeckSource(deckId);

    // Save buffer reference in audio graph
    nodesRef.current[deckId].buffer = track.buffer;
    nodesRef.current[deckId].pausedAt = 0;

    // Generate waveform peaks for visualization
    const rawData = track.buffer.getChannelData(0);
    const step = Math.floor(rawData.length / 300); // 300 bars
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

    // Reset Deck State
    const initialDeckState = {
      track: track,
      isPlaying: false,
      currentTime: 0,
      duration: track.buffer.duration,
      pitch: 0,
      volume: 1.0,
      eq: { low: 0, mid: 0, high: 0 },
      outroTime: track.outro,
      introTime: track.intro
    };

    if (deckId === 'A') {
      setDeckA(initialDeckState);
      addLog(`Cargado "${track.title}" en Deck A.`);
      
      if (startAutoTransition) {
        // Trigger automated mix from B to A
        triggerAutomatedTransition('B', 'A', track);
      }
    } else {
      setDeckB(initialDeckState);
      addLog(`Cargado "${track.title}" en Deck B.`);

      if (startAutoTransition) {
        // Trigger automated mix from A to B
        triggerAutomatedTransition('A', 'B', track);
      }
    }
  };

  // --- DECK ENGINE PLAYBACK CONTROLS ---
  
  const playDeckSource = (deckId, when = 0, pitchOverride = null) => {
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current[deckId];
    if (!ctx || !nodes.buffer) return;

    // Stop existing source
    if (nodes.source) {
      try { nodes.source.stop(); } catch(e) {}
    }

    // Create new source node (one-shot node)
    const source = ctx.createBufferSource();
    source.buffer = nodes.buffer;
    
    // Set pitch adjustment
    const deck = deckId === 'A' ? deckA : deckB;
    const pitch = pitchOverride !== null ? pitchOverride : deck.pitch;
    source.playbackRate.value = 1 + (pitch / 100);

    // Reconnect to filter chain
    source.connect(nodes.lowShelf);
    nodes.source = source;

    // Schedule playback start
    const startOffset = nodes.pausedAt;
    
    if (when === 0) {
      // Start immediately
      source.start(0, startOffset);
      nodes.startTime = ctx.currentTime;
    } else {
      // Start at scheduled time
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
      // Pause
      stopDeckSource(deckId);
      const elapsed = ctx.currentTime - nodes.startTime;
      nodes.pausedAt += elapsed;
      
      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, isPlaying: false }));
      } else {
        setDeckB(prev => ({ ...prev, isPlaying: false }));
      }
      addLog(`Deck ${deckId}: Pausado.`);
    } else {
      // Play
      playDeckSource(deckId);
      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, isPlaying: true }));
      } else {
        setDeckB(prev => ({ ...prev, isPlaying: true }));
      }
      // Set this deck as active focus
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

    if (deck.isPlaying) {
      // Restart at new position
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

  // Jump straight to outro - perfect for demo testing!
  const jumpToOutro = (deckId) => {
    const deck = deckId === 'A' ? deckA : deckB;
    if (!deck.track) return;
    
    // Jump 5 seconds before the outro point so the user can hear the trigger
    const targetTime = Math.max(0, deck.outroTime - 5);
    seekTo(deckId, targetTime / deck.duration);
    addLog(`Deck ${deckId}: Saltando a 5s antes del OUTRO para demostración.`);
  };

  // --- MIXING & EQ SLIDERS CONTROLS ---

  const handlePitchChange = (deckId, value) => {
    const val = parseFloat(value);
    if (deckId === 'A') {
      setDeckA(prev => ({ ...prev, pitch: val }));
      if (nodesRef.current.A.source) {
        nodesRef.current.A.source.playbackRate.value = 1 + (val / 100);
      }
    } else {
      setDeckB(prev => ({ ...prev, pitch: val }));
      if (nodesRef.current.B.source) {
        nodesRef.current.B.source.playbackRate.value = 1 + (val / 100);
      }
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
    const val = parseInt(value); // in dB
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

  // Equal-power crossfader logic
  useEffect(() => {
    const nodesA = nodesRef.current.A;
    const nodesB = nodesRef.current.B;
    if (!nodesA.gainNode || !nodesB.gainNode) return;

    // Crossfader value maps from -1 (Deck A) to +1 (Deck B)
    // Normalized to 0 to 1
    const x = (crossfader + 1) / 2;
    
    // Equal-power crossfading curve: cos(t) and sin(t)
    const gainA = Math.cos(x * Math.PI / 2) * deckA.volume;
    const gainB = Math.sin(x * Math.PI / 2) * deckB.volume;

    // Apply values (unless transition state is automating it natively)
    if (!transitionState.active) {
      nodesA.gainNode.gain.value = gainA;
      nodesB.gainNode.gain.value = gainB;
    }
  }, [crossfader, deckA.volume, deckB.volume, transitionState.active]);

  // --- TIME FORMATTING HELPERS ---
  const formatTime = (secs) => {
    if (isNaN(secs)) return "00:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // --- ACTIVE KEY AND COMPATIBILITY CHECKS ---
  const activeTrack = activeDeckId === 'A' ? deckA.track : deckB.track;
  const activeKey = activeTrack ? activeTrack.key : null;

  // Render compatibility wheel indicators
  const getWheelCompatSlots = () => {
    if (!activeKey) return Array(9).fill({ key: "-", label: "", isCompat: false });
    
    const num = parseInt(activeKey.slice(0, -1));
    const letter = activeKey.slice(-1);

    const prevNum = num === 1 ? 12 : num - 1;
    const nextNum = num === 12 ? 1 : num + 1;
    const oppositeLetter = letter === 'A' ? 'B' : 'A';

    return [
      { key: `${prevNum}${letter}`, label: "Anterior", isCompat: true },
      { key: `${num}${letter}`, label: "Actual", isCenter: true },
      { key: `${nextNum}${letter}`, label: "Siguiente", isCompat: true },
      { key: `${num}${oppositeLetter}`, label: "Relativo", isCompat: true }
    ];
  };

  const wheelSlots = getWheelCompatSlots();

  return (
    <div className="container">
      {/* --- HEADER --- */}
      <header className="panel">
        <div className="app-title-group">
          <Disc className={`logo-glow ${deckA.isPlaying || deckB.isPlaying ? 'autodj-icon' : ''}`} size={32} />
          <div>
            <h1>Moodsic Auto-DJ</h1>
            <p className="track-artist">Mezclador inteligente basado en Camelot Code y Web Audio API</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {autoDj && <span className="badge-auto-dj">Auto-DJ Activo</span>}
          <div className="track-count">
            Biblioteca: {library.length} pistas
          </div>
        </div>
      </header>

      {/* --- APP MAIN GRID --- */}
      <div className="app-grid">
        
        {/* --- LEFT SIDEBAR: LIBRARY MANAGER --- */}
        <section className="panel library-panel">
          <div className="library-header">
            <h2 className="library-title">Mi Biblioteca</h2>
            {library.length === 0 && (
              <button 
                onClick={loadAllDemos} 
                className="load-deck-btn load-deck-btn-a"
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <RefreshCw size={12} /> Cargar Demos
              </button>
            )}
          </div>

          {/* Drag & Drop Area */}
          <div className="drag-drop-zone" onClick={() => document.getElementById('audio-upload').click()}>
            <Upload className="upload-icon" size={28} />
            <span className="drag-drop-text">Arrastra archivos MP3 o haz clic</span>
            <span className="drag-drop-subtext">Archivos libres de DRM (locales)</span>
            <input 
              type="file" 
              id="audio-upload" 
              multiple 
              accept="audio/*" 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
            />
          </div>

          {/* Analyzing indicator */}
          {analyzingFile && (
            <div className="panel-active-cyan" style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <RefreshCw className="autodj-icon" size={14} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Analizando canción...</span>
              </div>
              <p style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{analyzingFile}</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--neon-cyan)', marginTop: '0.2rem' }}>{analyzingProgress}</p>
            </div>
          )}

          {/* Track List */}
          <div className="track-list-container">
            {library.length === 0 ? (
              <div className="deck-empty" style={{ height: 'auto', border: 'none' }}>
                <Music size={32} />
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Tu biblioteca está vacía.</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-dark)' }}>Sube archivos MP3 propios o haz clic en "Cargar Demos" arriba.</p>
              </div>
            ) : (
              library.map((track) => {
                // Compatibility flags with current playing track
                let isCompatBpm = false;
                let isCompatKey = false;
                
                if (activeTrack) {
                  const bpmDiffPercent = Math.abs(track.bpm - activeTrack.bpm) / activeTrack.bpm;
                  isCompatBpm = bpmDiffPercent <= 0.016;
                  isCompatKey = areKeysCompatible(track.key, activeTrack.key);
                }

                const isLoadedOnA = deckA.track?.id === track.id;
                const isLoadedOnB = deckB.track?.id === track.id;

                return (
                  <div 
                    key={track.id} 
                    className={`track-item ${isLoadedOnA ? 'playing-a' : ''} ${isLoadedOnB ? 'playing-b' : ''}`}
                  >
                    <div className="track-item-main">
                      <div className="track-item-title-group">
                        <p className="track-item-title">{track.title}</p>
                        <p className="track-item-artist">{track.artist}</p>
                      </div>
                      <div className="track-item-meta">
                        {track.isDemo && <span className="meta-badge badge-demo">Demo</span>}
                        <span className="meta-badge badge-bpm">{track.bpm} BPM</span>
                        <span className="meta-badge badge-key">{track.key}</span>
                      </div>
                    </div>
                    
                    <div className="track-item-actions">
                      <div className="load-buttons">
                        <button 
                          disabled={isLoadedOnA || isLoadedOnB}
                          onClick={() => loadTrackIntoDeck(track, 'A')}
                          className="load-deck-btn load-deck-btn-a"
                        >
                          Deck A
                        </button>
                        <button 
                          disabled={isLoadedOnA || isLoadedOnB}
                          onClick={() => loadTrackIntoDeck(track, 'B')}
                          className="load-deck-btn load-deck-btn-b"
                        >
                          Deck B
                        </button>
                      </div>

                      {/* Compatibility badge */}
                      {activeTrack && activeTrack.id !== track.id && (
                        <span className={`compatibility-status ${isCompatBpm && isCompatKey ? 'status-compatible' : 'status-incompatible'}`}>
                          {isCompatBpm && isCompatKey ? "✓ Compatible" : ""}
                          {(!isCompatBpm || !isCompatKey) && "Incompatible"}
                        </span>
                      )}

                      <button 
                        onClick={(e) => deleteTrack(track.id, e)}
                        className="load-deck-btn"
                        style={{ background: 'transparent', borderColor: 'transparent', padding: '0.2rem', color: 'var(--text-dark)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* --- CENTER SECTION: DECKS & MIXER --- */}
        <main className="decks-area">
          {/* Decks Grid */}
          <div className="decks-grid">
            
            {/* DECK A (Cyan accent) */}
            <section className={`panel deck deck-a ${activeDeckId === 'A' ? 'panel-active-cyan' : ''}`}>
              <div className="deck-header">
                <span className="deck-label">Deck A</span>
                {deckA.track && (
                  <span className="deck-key-display">{deckA.track.key}</span>
                )}
              </div>

              {deckA.track ? (
                <>
                  <div className="track-info">
                    <h3 className="track-title">{deckA.track.title}</h3>
                    <p className="track-artist">{deckA.track.artist}</p>
                  </div>

                  {/* Waveform Drawing */}
                  <div 
                    className="waveform-container"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percent = clickX / rect.width;
                      seekTo('A', percent);
                    }}
                  >
                    <canvas 
                      className="waveform-canvas"
                      ref={(canvas) => {
                        if (!canvas || !waveformData.A) return;
                        const ctx = canvas.getContext('2d');
                        const width = canvas.width = canvas.offsetWidth;
                        const height = canvas.height = canvas.offsetHeight;
                        
                        ctx.clearRect(0, 0, width, height);
                        const progressLimit = (deckA.currentTime / deckA.duration) * width;
                        
                        // Draw bars
                        const barWidth = width / waveformData.A.length;
                        waveformData.A.forEach((peak, i) => {
                          const x = i * barWidth;
                          const barHeight = peak * height * 0.9;
                          const y = (height - barHeight) / 2;
                          
                          // Played region is bright cyan, unplayed is darker blue
                          if (x < progressLimit) {
                            ctx.fillStyle = '#00f0ff';
                          } else {
                            ctx.fillStyle = '#17496e';
                          }
                          ctx.fillRect(x, y, barWidth - 1, barHeight);
                        });
                      }}
                    />
                    
                    {/* Play progress bar */}
                    <div 
                      className="waveform-progress-bar" 
                      style={{ left: `${(deckA.currentTime / deckA.duration) * 100}%` }}
                    />

                    {/* Intro Cue marker */}
                    <div 
                      style={{ 
                        left: `${(deckA.introTime / deckA.duration) * 100}%`,
                        position: 'absolute',
                        top: 0,
                        height: '100%',
                        width: '2px',
                        background: 'var(--neon-green)',
                        boxShadow: '0 0 8px var(--neon-green)',
                        opacity: 0.7
                      }}
                    />
                    <span 
                      className="outro-label"
                      style={{ 
                        left: `${(deckA.introTime / deckA.duration) * 100}%`,
                        background: 'var(--neon-green)',
                        color: '#000'
                      }}
                    >
                      DROP
                    </span>

                    {/* Outro Cue marker */}
                    <div 
                      className="outro-marker"
                      style={{ left: `${(deckA.outroTime / deckA.duration) * 100}%` }}
                    />
                    <span 
                      className="outro-label"
                      style={{ left: `${(deckA.outroTime / deckA.duration) * 100}%` }}
                    >
                      OUTRO
                    </span>
                  </div>

                  {/* Time and Pitch indicator */}
                  <div className="time-display">
                    <span>{formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}</span>
                    <span style={{ color: 'var(--neon-cyan)' }}>
                      {(deckA.track.bpm * (1 + deckA.pitch / 100)).toFixed(1)} BPM
                    </span>
                  </div>

                  {/* Controls Row */}
                  <div className="deck-controls-row">
                    <button 
                      onClick={() => togglePlay('A')} 
                      className={`play-btn ${deckA.isPlaying ? 'active' : ''}`}
                    >
                      {deckA.isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>

                    <button 
                      onClick={() => jumpToOutro('A')}
                      className="load-deck-btn load-deck-btn-a"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <SkipForward size={12} /> Test Outro
                    </button>

                    {/* Pitch slider */}
                    <div className="pitch-slider-container">
                      <div className="pitch-label-row">
                        <span>Pitch Fader</span>
                        <span className="pitch-val">{deckA.pitch > 0 ? '+' : ''}{deckA.pitch.toFixed(1)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="-5" 
                        max="5" 
                        step="0.1"
                        value={deckA.pitch} 
                        onChange={(e) => handlePitchChange('A', e.target.value)}
                        className="pitch-slider"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="deck-empty">
                  <Disc size={48} />
                  <p style={{ marginTop: '0.5rem' }}>Carga un tema en Deck A</p>
                </div>
              )}
            </section>

            {/* DECK B (Pink accent) */}
            <section className={`panel deck deck-b ${activeDeckId === 'B' ? 'panel-active-pink' : ''}`}>
              <div className="deck-header">
                <span className="deck-label">Deck B</span>
                {deckB.track && (
                  <span className="deck-key-display">{deckB.track.key}</span>
                )}
              </div>

              {deckB.track ? (
                <>
                  <div className="track-info">
                    <h3 className="track-title">{deckB.track.title}</h3>
                    <p className="track-artist">{deckB.track.artist}</p>
                  </div>

                  {/* Waveform Drawing */}
                  <div 
                    className="waveform-container"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percent = clickX / rect.width;
                      seekTo('B', percent);
                    }}
                  >
                    <canvas 
                      className="waveform-canvas"
                      ref={(canvas) => {
                        if (!canvas || !waveformData.B) return;
                        const ctx = canvas.getContext('2d');
                        const width = canvas.width = canvas.offsetWidth;
                        const height = canvas.height = canvas.offsetHeight;
                        
                        ctx.clearRect(0, 0, width, height);
                        const progressLimit = (deckB.currentTime / deckB.duration) * width;
                        
                        // Draw bars
                        const barWidth = width / waveformData.B.length;
                        waveformData.B.forEach((peak, i) => {
                          const x = i * barWidth;
                          const barHeight = peak * height * 0.9;
                          const y = (height - barHeight) / 2;
                          
                          if (x < progressLimit) {
                            ctx.fillStyle = '#ff007f';
                          } else {
                            ctx.fillStyle = '#6d1844';
                          }
                          ctx.fillRect(x, y, barWidth - 1, barHeight);
                        });
                      }}
                    />
                    
                    {/* Play progress bar */}
                    <div 
                      className="waveform-progress-bar" 
                      style={{ left: `${(deckB.currentTime / deckB.duration) * 100}%` }}
                    />

                    {/* Intro Cue marker */}
                    <div 
                      style={{ 
                        left: `${(deckB.introTime / deckB.duration) * 100}%`,
                        position: 'absolute',
                        top: 0,
                        height: '100%',
                        width: '2px',
                        background: 'var(--neon-green)',
                        boxShadow: '0 0 8px var(--neon-green)',
                        opacity: 0.7
                      }}
                    />
                    <span 
                      className="outro-label"
                      style={{ 
                        left: `${(deckB.introTime / deckB.duration) * 100}%`,
                        background: 'var(--neon-green)',
                        color: '#000'
                      }}
                    >
                      DROP
                    </span>

                    {/* Outro Cue marker */}
                    <div 
                      className="outro-marker"
                      style={{ left: `${(deckB.outroTime / deckB.duration) * 100}%` }}
                    />
                    <span 
                      className="outro-label"
                      style={{ left: `${(deckB.outroTime / deckB.duration) * 100}%` }}
                    >
                      OUTRO
                    </span>
                  </div>

                  {/* Time and Pitch indicator */}
                  <div className="time-display">
                    <span>{formatTime(deckB.currentTime)} / {formatTime(deckB.duration)}</span>
                    <span style={{ color: 'var(--neon-pink)' }}>
                      {(deckB.track.bpm * (1 + deckB.pitch / 100)).toFixed(1)} BPM
                    </span>
                  </div>

                  {/* Controls Row */}
                  <div className="deck-controls-row">
                    <button 
                      onClick={() => togglePlay('B')} 
                      className={`play-btn ${deckB.isPlaying ? 'active' : ''}`}
                    >
                      {deckB.isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>

                    <button 
                      onClick={() => jumpToOutro('B')}
                      className="load-deck-btn load-deck-btn-b"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <SkipForward size={12} /> Test Outro
                    </button>

                    {/* Pitch slider */}
                    <div className="pitch-slider-container">
                      <div className="pitch-label-row">
                        <span>Pitch Fader</span>
                        <span className="pitch-val">{deckB.pitch > 0 ? '+' : ''}{deckB.pitch.toFixed(1)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="-5" 
                        max="5" 
                        step="0.1"
                        value={deckB.pitch} 
                        onChange={(e) => handlePitchChange('B', e.target.value)}
                        className="pitch-slider"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="deck-empty">
                  <Disc size={48} />
                  <p style={{ marginTop: '0.5rem' }}>Carga un tema en Deck B</p>
                </div>
              )}
            </section>
          </div>

          {/* Central Mixer Panel */}
          <div className="panel mixer-panel" style={{ marginTop: '1.5rem' }}>
            <div className="mixer-header">
              <h2 className="mixer-title">Panel de Control de Mezclas</h2>
              <Sliders size={16} style={{ color: 'var(--text-muted)' }} />
            </div>

            {/* EQ Section */}
            <div className="eq-section">
              {/* Deck A EQs */}
              <div className="eq-column eq-deck-a">
                <span className="eq-deck-title eq-deck-a">Deck A EQs</span>
                
                {/* High EQ */}
                <div className="eq-knob-container">
                  <span className="eq-knob-label">High</span>
                  <div 
                    className="knob-wrapper"
                    onClick={(e) => {
                      // Simple cycle click for a web knob without drag complexity
                      const val = deckA.eq.high === 0 ? 6 : deckA.eq.high === 6 ? -12 : deckA.eq.high === -12 ? -40 : 0;
                      handleEqChange('A', 'high', val);
                    }}
                  >
                    <div className="knob-body">
                      <div 
                        className={`knob-marker ${deckA.eq.high !== 0 ? 'knob-marker-active' : ''}`} 
                        style={{ transform: `rotate(${(deckA.eq.high + 40) * (270/52) - 135}deg)` }}
                      />
                    </div>
                  </div>
                  <span className="eq-value-tooltip">{deckA.eq.high > 0 ? '+' : ''}{deckA.eq.high}dB</span>
                </div>

                {/* Mid EQ */}
                <div className="eq-knob-container">
                  <span className="eq-knob-label">Mid</span>
                  <div 
                    className="knob-wrapper"
                    onClick={() => {
                      const val = deckA.eq.mid === 0 ? 6 : deckA.eq.mid === 6 ? -12 : deckA.eq.mid === -12 ? -40 : 0;
                      handleEqChange('A', 'mid', val);
                    }}
                  >
                    <div className="knob-body">
                      <div 
                        className={`knob-marker ${deckA.eq.mid !== 0 ? 'knob-marker-active' : ''}`} 
                        style={{ transform: `rotate(${(deckA.eq.mid + 40) * (270/52) - 135}deg)` }}
                      />
                    </div>
                  </div>
                  <span className="eq-value-tooltip">{deckA.eq.mid > 0 ? '+' : ''}{deckA.eq.mid}dB</span>
                </div>

                {/* Low EQ */}
                <div className="eq-knob-container">
                  <span className="eq-knob-label">Low</span>
                  <div 
                    className="knob-wrapper"
                    onClick={() => {
                      const val = deckA.eq.low === 0 ? 6 : deckA.eq.low === 6 ? -12 : deckA.eq.low === -12 ? -40 : 0;
                      handleEqChange('A', 'low', val);
                    }}
                  >
                    <div className="knob-body">
                      <div 
                        className={`knob-marker ${deckA.eq.low !== 0 ? 'knob-marker-active' : ''}`} 
                        style={{ transform: `rotate(${(deckA.eq.low + 40) * (270/52) - 135}deg)` }}
                      />
                    </div>
                  </div>
                  <span className="eq-value-tooltip">{deckA.eq.low > 0 ? '+' : ''}{deckA.eq.low}dB</span>
                </div>
              </div>

              {/* Deck B EQs */}
              <div className="eq-column eq-deck-b">
                <span className="eq-deck-title eq-deck-b">Deck B EQs</span>
                
                {/* High EQ */}
                <div className="eq-knob-container">
                  <span className="eq-knob-label">High</span>
                  <div 
                    className="knob-wrapper"
                    onClick={() => {
                      const val = deckB.eq.high === 0 ? 6 : deckB.eq.high === 6 ? -12 : deckB.eq.high === -12 ? -40 : 0;
                      handleEqChange('B', 'high', val);
                    }}
                  >
                    <div className="knob-body">
                      <div 
                        className={`knob-marker ${deckB.eq.high !== 0 ? 'knob-marker-active' : ''}`} 
                        style={{ transform: `rotate(${(deckB.eq.high + 40) * (270/52) - 135}deg)` }}
                      />
                    </div>
                  </div>
                  <span className="eq-value-tooltip">{deckB.eq.high > 0 ? '+' : ''}{deckB.eq.high}dB</span>
                </div>

                {/* Mid EQ */}
                <div className="eq-knob-container">
                  <span className="eq-knob-label">Mid</span>
                  <div 
                    className="knob-wrapper"
                    onClick={() => {
                      const val = deckB.eq.mid === 0 ? 6 : deckB.eq.mid === 6 ? -12 : deckB.eq.mid === -12 ? -40 : 0;
                      handleEqChange('B', 'mid', val);
                    }}
                  >
                    <div className="knob-body">
                      <div 
                        className={`knob-marker ${deckB.eq.mid !== 0 ? 'knob-marker-active' : ''}`} 
                        style={{ transform: `rotate(${(deckB.eq.mid + 40) * (270/52) - 135}deg)` }}
                      />
                    </div>
                  </div>
                  <span className="eq-value-tooltip">{deckB.eq.mid > 0 ? '+' : ''}{deckB.eq.mid}dB</span>
                </div>

                {/* Low EQ */}
                <div className="eq-knob-container">
                  <span className="eq-knob-label">Low</span>
                  <div 
                    className="knob-wrapper"
                    onClick={() => {
                      const val = deckB.eq.low === 0 ? 6 : deckB.eq.low === 6 ? -12 : deckB.eq.low === -12 ? -40 : 0;
                      handleEqChange('B', 'low', val);
                    }}
                  >
                    <div className="knob-body">
                      <div 
                        className={`knob-marker ${deckB.eq.low !== 0 ? 'knob-marker-active' : ''}`} 
                        style={{ transform: `rotate(${(deckB.eq.low + 40) * (270/52) - 135}deg)` }}
                      />
                    </div>
                  </div>
                  <span className="eq-value-tooltip">{deckB.eq.low > 0 ? '+' : ''}{deckB.eq.low}dB</span>
                </div>
              </div>
            </div>

            {/* Volume sliders & Crossfader */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1.5rem', alignItems: 'center' }}>
              <div className="faders-section eq-section" style={{ height: '110px' }}>
                <div className="vol-fader-container eq-deck-a">
                  <span className="eq-knob-label">Vol A</span>
                  <div className="vol-slider-wrapper">
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05" 
                      value={deckA.volume} 
                      onChange={(e) => handleVolumeChange('A', e.target.value)}
                      className="vol-slider"
                    />
                  </div>
                </div>
                
                <div className="vol-fader-container eq-deck-b">
                  <span className="eq-knob-label">Vol B</span>
                  <div className="vol-slider-wrapper">
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05" 
                      value={deckB.volume} 
                      onChange={(e) => handleVolumeChange('B', e.target.value)}
                      className="vol-slider"
                    />
                  </div>
                </div>
              </div>

              {/* Crossfader */}
              <div className="crossfader-section">
                <div className="crossfader-label-row">
                  <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>Deck A</span>
                  <span>Crossfader</span>
                  <span style={{ color: 'var(--neon-pink)', fontWeight: 700 }}>Deck B</span>
                </div>
                <input 
                  type="range" 
                  min="-1" 
                  max="1" 
                  step="0.02" 
                  value={crossfader} 
                  onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                  className="crossfader-slider"
                  disabled={transitionState.active}
                />
              </div>
            </div>
          </div>
        </main>

        {/* --- RIGHT SIDEBAR: CAMELOT DASHBOARD & LOGS --- */}
        <section className="panel camelot-panel">
          <div>
            <h2 className="camelot-title" style={{ marginBottom: '0.75rem' }}>Dashboard Camelot</h2>
            
            {activeTrack ? (
              <div className="active-camelot-card">
                <div className="active-camelot-key">{activeKey}</div>
                <div className="active-camelot-name">{activeTrack.keyName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Tema en vivo: "{activeTrack.title}"
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.75rem 0', paddingTop: '0.5rem' }}>
                  <p className="eq-knob-label" style={{ marginBottom: '0.5rem', textAlign: 'left' }}>Tonalidades Compatibles:</p>
                  
                  <div className="compatibility-wheel-mini">
                    {wheelSlots.map((slot, i) => (
                      <div 
                        key={i} 
                        className={`wheel-slot ${slot.isCenter ? 'wheel-slot-center' : slot.isCompat ? 'wheel-slot-compat' : ''}`}
                      >
                        <span style={{ fontWeight: 'bold' }}>{slot.key}</span>
                        <span className="wheel-slot-label">{slot.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="active-camelot-card active-camelot-card-empty">
                Haz sonar una canción para ver la rueda de compatibilidad armónica.
              </div>
            )}
          </div>

          {/* Compatibility explanation */}
          <div className="panel" style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
            <div className="compatibility-guide">
              <span className="eq-knob-label" style={{ fontWeight: 'bold' }}>Guía Armónica (Regla de Mezcla)</span>
              <p style={{ fontSize: '0.7rem' }}>Para transiciones fluidas sin disonancia armónica, mezcla canciones cuya clave sea:</p>
              <div className="guide-item">
                <div className="guide-dot dot-same"></div>
                <span>Misma tonalidad (ej. 8A ➔ 8A)</span>
              </div>
              <div className="guide-item">
                <div className="guide-dot dot-adjacent"></div>
                <span>Código contiguo en la rueda (ej. 8A ➔ 9A o 7A)</span>
              </div>
              <div className="guide-item">
                <div className="guide-dot dot-relative"></div>
                <span>Cambio de escala Relativa Mayor/Menor (ej. 8A ➔ 8B)</span>
              </div>
            </div>
          </div>

          {/* Auto-DJ Controls & Activity Logs */}
          <div className="autodj-controls">
            <div className="autodj-header">
              <div className="autodj-title-group">
                <Disc className="autodj-icon" size={16} />
                <span>Auto-DJ Inteligente</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={autoDj} 
                  onChange={(e) => setAutoDj(e.target.checked)}
                />
                <span className="slider-toggle"></span>
              </label>
            </div>
            
            <p className="autodj-status-text">
              {autoDj 
                ? "El motor monitorea las salidas de los temas y cargará + sincronizará automáticamente la siguiente pista compatible." 
                : "Control manual activo. Eres responsable de sincronizar y disparar las mezclas."}
            </p>

            {/* Live transition warning */}
            {transitionState.active && (
              <div className="autodj-transition-alert">
                ¡TRANSMISIÓN EN CURSO! ({transitionState.phase.toUpperCase()})
              </div>
            )}
          </div>

          {/* Activity Logger */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span className="eq-knob-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Registro del Mezclador (Logs)</span>
            <div 
              style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                height: '140px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem'
              }}
            >
              {djLogs.map((log, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.01)', paddingBottom: '0.15rem' }}>
                  <span style={{ color: 'var(--text-dark)' }}>&gt;</span> {log}
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
