import { useState, useEffect, useRef, useMemo } from 'react'
import { formatTime } from '../utils/formatTime'
import { createDeckGraph } from '../audio/audioGraph'
import {
  handleScratchStart as scratchStart,
  handleScratchUpdate as scratchUpdate,
  handleScratchStop as scratchStop
} from '../audio/scratchEngine'

export function useAudioDeck({
  deckId,
  audioCtxRef,
  initAudio,
  addLog,
  onPlaybackEnded,
  onTimeUpdate,
  onSetActiveDeck,
  onSeekMarkerCheck,
  onOutroCueChanged,
  onUpdateTrackCuePoints
}) {
  const [deck, setDeck] = useState({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    pitch: 0, // pitch fader offset (-10% to +10%)
    volume: 1.0,
    eq: { low: 0, mid: 0, high: 0 }, // values in dB (-40 to 12)
    outroTime: 0,
    introTime: 0,
    cueTime: 0,
    vinylMode: true,
    isUserSelected: false,
    activeLoopBars: null,
    loopStart: 0,
    loopEnd: 0
  });

  const [waveformData, setWaveformData] = useState(null);

  const nodesRef = useRef({
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
  });

  // Scratch refs
  const isScratchingRef = useRef(false);
  const dragModeRef = useRef(null);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const bendTimeoutRef = useRef(null);

  // Proxy to match scratchEngine's multi-deck ref structure
  const scratchRefs = useMemo(() => ({
    isScratchingRef: {
      get current() {
        return {
          get [deckId]() { return isScratchingRef.current; },
          set [deckId](val) { isScratchingRef.current = val; }
        };
      }
    },
    dragModeRef: {
      get current() {
        return {
          get [deckId]() { return dragModeRef.current; },
          set [deckId](val) { dragModeRef.current = val; }
        };
      }
    },
    lastXRef: {
      get current() {
        return {
          get [deckId]() { return lastXRef.current; },
          set [deckId](val) { lastXRef.current = val; }
        };
      }
    },
    lastTimeRef: {
      get current() {
        return {
          get [deckId]() { return lastTimeRef.current; },
          set [deckId](val) { lastTimeRef.current = val; }
        };
      }
    },
    bendTimeoutRef: {
      get current() {
        return {
          get [deckId]() { return bendTimeoutRef.current; },
          set [deckId](val) { bendTimeoutRef.current = val; }
        };
      }
    }
  }), [deckId]);

  // Initialize nodes lazily
  const init = (ctx) => {
    if (nodesRef.current.gainNode) return;
    const graph = createDeckGraph(ctx);
    Object.assign(nodesRef.current, graph);
  };

  const playDeckSource = (when = 0, pitchOverride = null) => {
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current;
    if (!ctx || !nodes.buffer) return;

    if (nodes.source) {
      try { nodes.source.stop(); } catch(e) {}
    }

    const source = ctx.createBufferSource();
    source.buffer = nodes.buffer;
    
    const pitch = pitchOverride !== null ? pitchOverride : nodes.pitch;
    source.playbackRate.value = 1 + (pitch / 100);
    nodes.pitch = pitch;

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

  const stopDeckSource = () => {
    const nodes = nodesRef.current;
    if (nodes.source) {
      try {
        nodes.source.stop();
      } catch(e) {}
      nodes.source = null;
    }
  };

  const togglePlay = () => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }

    const nodes = nodesRef.current;
    if (!nodes.buffer) return;

    if (deck.isPlaying) {
      stopDeckSource();
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
      setDeck(prev => ({ ...prev, isPlaying: false }));
      addLog(`Deck ${deckId}: Pausado.`);
    } else {
      playDeckSource();
      setDeck(prev => ({ ...prev, isPlaying: true }));
      onSetActiveDeck(deckId);
      addLog(`Deck ${deckId}: Reproduciendo.`);
    }
  };

  const seekTo = (percent) => {
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current;
    if (!nodes.buffer) return;

    if (nodes.loopActive) {
      nodes.loopActive = false;
      nodes.activeLoopBars = null;
      nodes.loopStart = 0;
      nodes.loopEnd = 0;
      if (nodes.source) {
        nodes.source.loop = false;
      }
      setDeck(prev => ({ ...prev, activeLoopBars: null, loopStart: 0, loopEnd: 0 }));
    }

    const targetTime = percent * deck.duration;
    nodes.pausedAt = targetTime;

    if (onSeekMarkerCheck) {
      onSeekMarkerCheck(deckId, targetTime);
    }

    if (deck.isPlaying) {
      playDeckSource();
      nodes.startTime = ctx.currentTime;
    }
    
    setDeck(prev => ({ ...prev, currentTime: targetTime }));
    addLog(`Deck ${deckId}: Saltar a ${formatTime(targetTime)}.`);
  };

  const updatePitch = (newPitch) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const nodes = nodesRef.current;
    
    if (nodes.source) {
      const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
      const oldPlaybackRate = 1 + (nodes.pitch / 100);
      nodes.pausedAt += elapsed * oldPlaybackRate;
      nodes.startTime = ctx.currentTime;
      
      const newPlaybackRate = 1 + (newPitch / 100);
      nodes.source.playbackRate.value = newPlaybackRate;
    }
    nodes.pitch = newPitch;
    setDeck(prev => ({ ...prev, pitch: newPitch }));
  };

  const handleVolumeChange = (value) => {
    const val = parseFloat(value);
    setDeck(prev => ({ ...prev, volume: val }));
  };

  const handleEqChange = (band, value) => {
    const val = parseInt(value);
    const nodes = nodesRef.current;
    
    if (nodes[band === 'low' ? 'lowShelf' : band === 'mid' ? 'midPeaking' : 'highShelf']) {
      nodes[band === 'low' ? 'lowShelf' : band === 'mid' ? 'midPeaking' : 'highShelf'].gain.value = val;
    }

    setDeck(prev => ({ ...prev, eq: { ...prev.eq, [band]: val } }));
  };

  const toggleDeckLoop = (bars) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const nodes = nodesRef.current;
    if (!deck.track || !nodes.buffer) return;

    const bpm = deck.track.bpm || 120;
    const firstBeatOffset = deck.track.firstBeatOffset || 0;
    const beatDuration = 60 / bpm;
    const barDuration = 4 * beatDuration;
    const loopDuration = bars * barDuration;

    if (nodes.loopActive && nodes.activeLoopBars === bars) {
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
      const newLoopEnd = Math.min(deck.duration, nodes.loopStart + loopDuration);
      nodes.activeLoopBars = bars;
      nodes.loopEnd = newLoopEnd;

      if (nodes.source) {
        nodes.source.loopEnd = newLoopEnd;
      }

      if (nodes.source && deck.isPlaying) {
        const playbackRate = 1 + (nodes.pitch / 100);
        const elapsed = Math.max(0, ctx.currentTime - nodes.startTime);
        const current = nodes.pausedAt + elapsed * playbackRate;
        if (current > newLoopEnd) {
          const newLoopDuration = newLoopEnd - nodes.loopStart;
          const timeInLoop = (current - nodes.loopStart) % newLoopDuration;
          nodes.pausedAt = nodes.loopStart + timeInLoop;
          playDeckSource();
        }
      }

      setDeck(prev => ({ ...prev, activeLoopBars: bars, loopEnd: newLoopEnd }));
      addLog(`Deck ${deckId}: Loop redimensionado a ${bars} barras (${formatTime(nodes.loopStart)} - ${formatTime(newLoopEnd)}).`);
    } else {
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

  const updateDeckCuePoints = (markerType, newTime) => {
    if (!deck.track) return;
    const trackId = deck.track.id;
    
    if (markerType === 'drop') {
      const cueVal = deck.cueTime || 0;
      const outroVal = deck.outroTime || deck.duration;
      const validatedTime = Math.max(cueVal, Math.min(newTime, outroVal));

      setDeck(prev => {
        if (!prev.track) return prev;
        return {
          ...prev,
          introTime: validatedTime,
          track: { ...prev.track, intro: validatedTime }
        };
      });
      if (onUpdateTrackCuePoints) {
        onUpdateTrackCuePoints(trackId, validatedTime, undefined, undefined);
      }
    } else if (markerType === 'outro') {
      const dropVal = deck.introTime || 0;
      const validatedTime = Math.max(dropVal, Math.min(newTime, deck.duration));

      setDeck(prev => {
        if (!prev.track) return prev;
        return {
          ...prev,
          outroTime: validatedTime,
          track: { ...prev.track, outro: validatedTime }
        };
      });
      if (onUpdateTrackCuePoints) {
        onUpdateTrackCuePoints(trackId, undefined, validatedTime, undefined);
      }
      if (onOutroCueChanged) {
        onOutroCueChanged(deckId, validatedTime);
      }
    } else if (markerType === 'cue') {
      const dropVal = deck.introTime || 0;
      const validatedTime = Math.max(0, Math.min(newTime, dropVal));

      setDeck(prev => {
        if (!prev.track) return prev;
        const updates = {
          cueTime: validatedTime,
          track: { ...prev.track, cue: validatedTime }
        };
        if (!prev.isPlaying) {
          updates.currentTime = validatedTime;
        }
        return { ...prev, ...updates };
      });
      if (!deck.isPlaying) {
        nodesRef.current.pausedAt = validatedTime;
      }
      if (onUpdateTrackCuePoints) {
        onUpdateTrackCuePoints(trackId, undefined, undefined, validatedTime);
      }
    }
  };

  const toggleVinylMode = () => {
    setDeck(prev => {
      const nextVal = !prev.vinylMode;
      addLog(`Deck ${deckId}: Vinyl Mode ${nextVal ? 'ACTIVADO' : 'DESACTIVADO'}.`);
      return { ...prev, vinylMode: nextVal };
    });
  };

  const startScratch = (isUpperHalf, clientX, clientY, onTransitionActiveCheck) => {
    if (onTransitionActiveCheck && onTransitionActiveCheck()) {
      addLog(`Deck ${deckId}: Interacción bloqueada durante mezcla automática.`);
      return;
    }
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    scratchStart(nodesRef.current, ctx, deck, isUpperHalf, clientX, scratchRefs, deckId, playDeckSource);
  };

  const updateScratch = (clientX, width, onTransitionActiveCheck) => {
    if (onTransitionActiveCheck && onTransitionActiveCheck()) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const result = scratchUpdate(nodesRef.current, ctx, deck, clientX, width, scratchRefs, deckId);
    if (result) {
      setDeck(prev => ({ ...prev, currentTime: result.newTime }));
    }
  };

  const stopScratch = (isQuickClick, clickPercent, onTransitionActiveCheck) => {
    if (onTransitionActiveCheck && onTransitionActiveCheck()) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    scratchStop(nodesRef.current, ctx, deck, isQuickClick, clickPercent, scratchRefs, deckId, seekTo, playDeckSource, stopDeckSource);
  };

  const loadTrack = (track, isAutoload = false, initialPitch = 0, initialPausedAt = 0) => {
    initAudio();
    stopDeckSource();

    nodesRef.current.buffer = track.buffer;
    nodesRef.current.pausedAt = initialPausedAt;
    nodesRef.current.loopActive = false;
    nodesRef.current.loopStart = 0;
    nodesRef.current.loopEnd = 0;
    nodesRef.current.activeLoopBars = null;

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
    
    const normalizedPeaks = maxVal > 0 ? peaks.map(p => p / maxVal) : peaks;
    setWaveformData(normalizedPeaks);

    nodesRef.current.pitch = initialPitch;

    setDeck({
      track: track,
      isPlaying: false,
      currentTime: initialPausedAt,
      duration: track.buffer.duration,
      pitch: initialPitch,
      volume: 1.0,
      eq: { low: 0, mid: 0, high: 0 },
      outroTime: track.outro,
      introTime: track.intro,
      cueTime: track.cue || 0,
      vinylMode: deck.vinylMode,
      isUserSelected: !isAutoload,
      activeLoopBars: null,
      loopStart: 0,
      loopEnd: 0
    });

    addLog(`Cargado "${track.title}" en Deck ${deckId}.`);
  };

  // Local requestAnimationFrame progress loop
  useEffect(() => {
    let frameId;
    const updateProgress = () => {
      const ctx = audioCtxRef.current;
      if (!ctx || !deck.isPlaying) return;

      if (isScratchingRef.current) {
        frameId = requestAnimationFrame(updateProgress);
        return;
      }

      const elapsed = Math.max(0, ctx.currentTime - nodesRef.current.startTime);
      const playbackRate = 1 + (nodesRef.current.pitch / 100);
      let current = nodesRef.current.pausedAt + elapsed * playbackRate;

      if (nodesRef.current.loopActive) {
        const loopDuration = nodesRef.current.loopEnd - nodesRef.current.loopStart;
        if (current >= nodesRef.current.loopEnd && loopDuration > 0) {
          const timeInLoop = (current - nodesRef.current.loopStart) % loopDuration;
          current = nodesRef.current.loopStart + timeInLoop;
        }
      }

      if (current >= deck.duration) {
        onPlaybackEnded(deckId);
      } else {
        setDeck(prev => ({ ...prev, currentTime: current }));
        if (onTimeUpdate) {
          onTimeUpdate(deckId, current);
        }
      }
      frameId = requestAnimationFrame(updateProgress);
    };

    if (deck.isPlaying) {
      frameId = requestAnimationFrame(updateProgress);
    }
    return () => cancelAnimationFrame(frameId);
  }, [deck.isPlaying, deck.duration, deckId, onPlaybackEnded, onTimeUpdate]);

  return {
    state: deck,
    setState: setDeck,
    nodes: nodesRef.current,
    waveformData,
    init,
    loadTrack,
    playDeckSource,
    stopDeckSource,
    togglePlay,
    seekTo,
    updatePitch,
    handleVolumeChange,
    handleEqChange,
    toggleDeckLoop,
    updateDeckCuePoints,
    toggleVinylMode,
    startScratch,
    updateScratch,
    stopScratch
  };
}
