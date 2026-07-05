import { useState, useEffect, useRef, useCallback } from 'react';
import { findCompatibleTrack as findCompatible } from '../audio/trackSelection';
import { updateFx as applyFx } from '../audio/fxEngine';
import { useAudioDeck } from './useAudioDeck';
import { useSessionTimer } from './useSessionTimer';
import { useAutoloadManager } from './useAutoloadManager';
import { useTransitionController } from './useTransitionController';

export function useAudioEngine({ library, addLog, onUpdateTrackCuePoints }) {
  const [djMode, setDjMode] = useState('autodj'); // 'manual', 'autodj', 'jukebox'
  const autoDj = djMode !== 'manual';
  const [autoDjStyle, setAutoDjStyle] = useState('eq'); // 'eq' or 'bass'
  const [eqOrder, setEqOrder] = useState(['mid', 'low', 'high']);
  const [playedTrackIds, setPlayedTrackIds] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState('A'); // 'A' or 'B'
  const [masterBpm, setMasterBpm] = useState(128);

  const [fxState, setFxState] = useState({
    active: false,
    type: 'Filter',
    x: 0.5,
    y: 0.5
  });

  // State refs for async callbacks
  const libraryRef = useRef(library);
  const playedTrackIdsRef = useRef(playedTrackIds);
  const djModeRef = useRef(djMode);
  const masterBpmRef = useRef(masterBpm);

  useEffect(() => { libraryRef.current = library; }, [library]);
  useEffect(() => { playedTrackIdsRef.current = playedTrackIds; }, [playedTrackIds]);
  useEffect(() => { masterBpmRef.current = masterBpm; }, [masterBpm]);
  useEffect(() => { djModeRef.current = djMode; }, [djMode]);

  // Audio Context Ref
  const audioCtxRef = useRef(null);

  // Initialize Web Audio Context lazily
  function initAudio() {
    if (audioCtxRef.current) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    
    deckA.init(ctx);
    deckB.init(ctx);

    addLog("Web Audio Engine inicializado correctamente.");
  }

  // --- Sub-hook 1: Autoload Manager ---
  const {
    autoloadCountdown,
    autoloadNotification,
    getAutoloadScheduler,
    cancelAutoload,
    cancelAllAutoloads,
    dismissAutoloadNotification
  } = useAutoloadManager({ addLog });

  const findCompatibleTrack = useCallback((currentTrack) => {
    return findCompatible(currentTrack, libraryRef.current, playedTrackIdsRef.current, djModeRef.current);
  }, []);

  // --- Deck Instances ---
  // Forward ref declaration for loadTrackIntoDeck binding
  const loadTrackIntoDeckRef = useRef(null);

  const deckA = useAudioDeck({
    deckId: 'A',
    audioCtxRef,
    initAudio,
    addLog,
    onPlaybackEnded: (id) => handlePlaybackEnded(id),
    onTimeUpdate: (id, time) => {
      if (checkAutoDjTransitionRef.current) {
        checkAutoDjTransitionRef.current(id, time, loadTrackIntoDeckRef.current);
      }
    },
    onSetActiveDeck: (id) => setActiveDeckId(id),
    onSeekMarkerCheck: (id, targetTime) => {
      if (resetCheckedStateRef.current) {
        resetCheckedStateRef.current(id, targetTime, deckA.state.outroTime);
      }
    },
    onOutroCueChanged: (id, validatedTime) => {
      if (resetCheckedStateRef.current) {
        resetCheckedStateRef.current(id, deckA.state.currentTime, validatedTime);
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
    onTimeUpdate: (id, time) => {
      if (checkAutoDjTransitionRef.current) {
        checkAutoDjTransitionRef.current(id, time, loadTrackIntoDeckRef.current);
      }
    },
    onSetActiveDeck: (id) => setActiveDeckId(id),
    onSeekMarkerCheck: (id, targetTime) => {
      if (resetCheckedStateRef.current) {
        resetCheckedStateRef.current(id, targetTime, deckB.state.outroTime);
      }
    },
    onOutroCueChanged: (id, validatedTime) => {
      if (resetCheckedStateRef.current) {
        resetCheckedStateRef.current(id, deckB.state.currentTime, validatedTime);
      }
    },
    onUpdateTrackCuePoints
  });

  // --- Sub-hook 2: Session Timer ---
  const { sessionElapsedTime } = useSessionTimer(deckA.state.isPlaying, deckB.state.isPlaying);

  // --- Sub-hook 3: Transition Controller ---
  const changeMasterBpm = useCallback((newBpm) => {
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
  }, [deckA, deckB]);

  const {
    transitionState,
    transitionActiveRef,
    resetCheckedState,
    triggerAutomatedTransition,
    checkAutoDjTransition
  } = useTransitionController({
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
  });

  const checkAutoDjTransitionRef = useRef(checkAutoDjTransition);
  useEffect(() => { checkAutoDjTransitionRef.current = checkAutoDjTransition; }, [checkAutoDjTransition]);

  const resetCheckedStateRef = useRef(resetCheckedState);
  useEffect(() => { resetCheckedStateRef.current = resetCheckedState; }, [resetCheckedState]);

  // Handle DJ mode changes
  useEffect(() => {
    if (djMode === 'manual') {
      cancelAllAutoloads();
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

  // Channel volume control logic
  useEffect(() => {
    if (!deckA.nodes.gainNode || !deckB.nodes.gainNode) return;

    if (!transitionState.active) {
      deckA.nodes.gainNode.gain.value = deckA.state.volume;
      deckB.nodes.gainNode.gain.value = deckB.state.volume;
    }
  }, [deckA.state.volume, deckB.state.volume, deckA.nodes.gainNode, deckB.nodes.gainNode, transitionState.active]);

  const handlePlaybackEnded = (deckId) => {
    addLog(`Deck ${deckId}: Canción finalizada.`);
    const nodes = deckId === 'A' ? deckA.nodes : deckB.nodes;
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

  const loadTrackIntoDeck = useCallback((track, deckId, startAutoTransition = false, isAutoload = false) => {
    initAudio();

    const currentDjMode = djModeRef.current;
    const currentDeck = deckId === 'A' ? deckA.state : deckB.state;
    const modeLabel = currentDjMode === 'jukebox' ? 'Jukebox' : 'Auto-DJ';
    
    if (isAutoload && currentDeck.track && currentDeck.isUserSelected) {
      addLog(`${modeLabel}: Conservando la canción "${currentDeck.track.title}" elegida por el usuario en Deck ${deckId}.`);
      return;
    }

    if (!isAutoload) {
      cancelAutoload(deckId);
      addLog(`${modeLabel}: Cancelada cuenta regresiva en Deck ${deckId} por carga manual.`);
    }

    setPlayedTrackIds(prev => prev.includes(track.id) ? prev : [...prev, track.id]);

    const initialPitch = currentDjMode === 'jukebox' ? 0 : (((masterBpm - track.bpm) / track.bpm) * 100);
    const trackCue = track.cue || 0;
    const initialPausedAt = (!isAutoload && trackCue > 0) ? trackCue : 0;

    if (deckId === 'A') {
      deckA.loadTrack(track, isAutoload, initialPitch, initialPausedAt);
      if (startAutoTransition) {
        triggerAutomatedTransition('B', 'A', track, loadTrackIntoDeckRef.current);
      }
    } else {
      deckB.loadTrack(track, isAutoload, initialPitch, initialPausedAt);
      if (startAutoTransition) {
        triggerAutomatedTransition('A', 'B', track, loadTrackIntoDeckRef.current);
      }
    }
  }, [deckA, deckB, masterBpm, addLog, cancelAutoload, triggerAutomatedTransition]);

  loadTrackIntoDeckRef.current = loadTrackIntoDeck;

  const resyncDecks = () => {
    if (!deckA.state.isPlaying || !deckB.state.isPlaying) {
      addLog("Sincronización: Ambos decks deben estar reproduciéndose para resincronizar.");
      return;
    }

    const masterId = activeDeckId;
    const slaveId = masterId === 'A' ? 'B' : 'A';
    const masterDeck = masterId === 'A' ? deckA : deckB;
    const slaveDeck = slaveId === 'A' ? deckA : deckB;

    if (!masterDeck.state.track || !slaveDeck.state.track) return;

    const masterBpmVal = masterBpm;
    const slaveOriginalBpm = slaveDeck.state.track.bpm;
    const targetPitch = ((masterBpmVal - slaveOriginalBpm) / slaveOriginalBpm) * 100;

    slaveDeck.updatePitch(targetPitch);

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

    const nodesSlave = slaveDeck.nodes;
    nodesSlave.pausedAt = targetTime;

    if (slaveDeck.state.isPlaying) {
      slaveDeck.playDeckSource();
      nodesSlave.startTime = ctx.currentTime;
    }

    slaveDeck.setState(prev => ({ ...prev, currentTime: targetTime }));

    addLog(`Sincronización: Deck ${slaveId} sincronizado con Deck ${masterId} (Tiempo: ${t_slave.toFixed(2)}s ➔ ${targetTime.toFixed(2)}s).`);
  };

  const updateFx = (active, type, x, y, isInitialTouch = false, isQuickClick = false) => {
    setFxState({ active, type, x, y });
    
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const deckId = activeDeckId;
    const nodes = deckId === 'A' ? deckA.nodes : deckB.nodes;
    
    applyFx(nodes, ctx, { active, type, x, y, masterBpm, isInitialTouch });

    if (type === 'Scratch') {
      const isUpperHalf = y > 0.5;
      const currentDeck = deckId === 'A' ? deckA : deckB;
      if (active) {
        if (isInitialTouch) {
          currentDeck.startScratch(isUpperHalf, x, y, () => transitionState.active);
        } else {
          const width = 1;
          currentDeck.updateScratch(x, width, () => transitionState.active);
        }
      } else {
        currentDeck.stopScratch(isQuickClick, x, () => transitionState.active);
      }
    }
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
    autoloadCountdown,
    autoloadNotification,
    dismissAutoloadNotification,
    toggleVinylMode: (deckId) => (deckId === 'A' ? deckA.toggleVinylMode() : deckB.toggleVinylMode()),
    startScratch: (deckId, isUpperHalf, clientX, clientY) => (deckId === 'A' ? deckA.startScratch(isUpperHalf, clientX, clientY, () => transitionState.active) : deckB.startScratch(isUpperHalf, clientX, clientY, () => transitionState.active)),
    updateScratch: (deckId, clientX, width) => (deckId === 'A' ? deckA.updateScratch(clientX, width, () => transitionState.active) : deckB.updateScratch(clientX, width, () => transitionState.active)),
    stopScratch: (deckId, isQuickClick, clickPercent) => (deckId === 'A' ? deckA.stopScratch(isQuickClick, clickPercent, () => transitionState.active) : deckB.stopScratch(isQuickClick, clickPercent, () => transitionState.active)),
    toggleDeckLoop: (deckId, bars) => (deckId === 'A' ? deckA.toggleDeckLoop(bars) : deckB.toggleDeckLoop(bars)),
    updateDeckCuePoints: (deckId, markerType, newTime) => (deckId === 'A' ? deckA.updateDeckCuePoints(markerType, newTime) : deckB.updateDeckCuePoints(markerType, newTime))
  };
}
