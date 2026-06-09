import React, { useState, useEffect, useRef } from 'react'
import { 
  Play, Pause, SkipForward, Upload, Music, Sliders, 
  Volume2, Disc, Check, AlertCircle, Trash2, FolderOpen, RefreshCw 
} from 'lucide-react'
import { 
  decodeAudioFile, decodeAudioFromUrl, detectBPM, detectKey, detectOutro, detectIntro, areKeysCompatible, detectGenre 
} from './utils/audioAnalyzer'
import { DEMO_TRACKS } from './constants/demoTracks'
import { formatTime } from './utils/formatTime'
import Header from './components/Header'
import ActivityLog from './components/ActivityLog'
import EqKnob from './components/EqKnob'
import Waveform from './components/Waveform'
import LibraryPanel from './components/LibraryPanel'
import CamelotPanel from './components/CamelotPanel'
import { useAudioEngine } from './hooks/useAudioEngine'
import Deck from './components/Deck'
import MixMaster from './components/MixMaster'
import MixerPanel from './components/MixerPanel'


export default function App() {
  // --- STATE ---
  const [library, setLibrary] = useState([]);
  const [analyzingFile, setAnalyzingFile] = useState(null);
  const [analyzingProgress, setAnalyzingProgress] = useState("");
  const [djLogs, setDjLogs] = useState(["DJ Engine listo. Carga canciones para comenzar."]);
  const addLog = (msg) => setDjLogs(prev => [msg, ...prev.slice(0, 19)]);

  const {
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
  } = useAudioEngine({ library, addLog });

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
        const bpmData = await detectBPM(decodedBuffer);
        const bpm = bpmData.bpm;
        const firstBeatOffset = bpmData.firstBeatOffset;
        
        setAnalyzingProgress("Detectando escala musical...");
        const keyData = await detectKey(decodedBuffer);
        
        setAnalyzingProgress("Detectando punto de salida (Outro)...");
        const outroTime = detectOutro(decodedBuffer);

        setAnalyzingProgress("Detectando punto de entrada (Intro)...");
        const introTime = detectIntro(decodedBuffer, bpm);

        setAnalyzingProgress("Detectando estilo musical...");
        const genreData = detectGenre(decodedBuffer, bpm);

        const fullName = file.name.replace(/\.[^/.]+$/, ""); // Strip extension
        let artist = 'Artista Desconocido';
        let title = fullName;

        const parts = fullName.split(/\s+-\s+/);
        if (parts.length > 1) {
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        } else {
          const hyphenParts = fullName.split('-');
          if (hyphenParts.length > 1) {
            artist = hyphenParts[0].trim();
            title = hyphenParts.slice(1).join('-').trim();
          }
        }

        const newTrack = {
          id: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          title: title,
          artist: artist,
          bpm: bpm,
          key: keyData.camelot,
          keyName: keyData.keyName,
          outro: outroTime,
          intro: introTime,
          firstBeatOffset: firstBeatOffset,
          duration: decodedBuffer.duration,
          buffer: decodedBuffer,
          isDemo: false,
          genre: genreData.genre,
          genreConfidence: genreData.confidence
        };

        setLibrary(prev => [newTrack, ...prev]);
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
      const bpmData = await detectBPM(decodedBuffer);
      const bpm = bpmData.bpm;
      const firstBeatOffset = bpmData.firstBeatOffset;
      
      setAnalyzingProgress("Analizando tono (Camelot)...");
      const keyData = await detectKey(decodedBuffer);
      
      setAnalyzingProgress("Analizando outro...");
      const outroTime = detectOutro(decodedBuffer);

      setAnalyzingProgress("Analizando intro...");
      const introTime = detectIntro(decodedBuffer, bpm);

      setAnalyzingProgress("Detectando estilo musical...");
      const genreData = detectGenre(decodedBuffer, bpm);

      const analyzedTrack = {
        ...demoTrack,
        bpm: demoTrack.bpm !== undefined ? demoTrack.bpm : bpm,
        key: demoTrack.key !== undefined ? demoTrack.key : keyData.camelot,
        keyName: demoTrack.keyName !== undefined ? keyData.keyName : keyData.keyName,
        outro: demoTrack.outro !== undefined ? demoTrack.outro : outroTime,
        intro: demoTrack.intro !== undefined ? demoTrack.intro : introTime,
        firstBeatOffset: demoTrack.firstBeatOffset !== undefined ? demoTrack.firstBeatOffset : firstBeatOffset,
        duration: decodedBuffer.duration,
        buffer: decodedBuffer,
        genre: demoTrack.genre !== undefined ? demoTrack.genre : genreData.genre,
        genreConfidence: demoTrack.genreConfidence !== undefined ? demoTrack.genreConfidence : genreData.confidence
      };

      setLibrary(prev => {
        const cleaned = prev.filter(t => t.id !== demoTrack.id);
        return [...cleaned, analyzedTrack];
      });

      addLog(`Demo cargada con éxito: "${analyzedTrack.title}" (${bpm} BPM, Tono: ${keyData.camelot}, Intro/Drop: ${introTime.toFixed(1)}s, Outro: ${outroTime.toFixed(1)}s)`);
    } catch (err) {
      console.error(err);
      addLog(`Error cargando demo: ${err.message}. Intentando fallback local.`);
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

  // --- ACTIVE KEY AND COMPATIBILITY CHECKS ---
  const activeTrack = activeDeckId === 'A' ? deckA.track : deckB.track;


  return (
    <div className="container">
      {/* --- HEADER --- */}
      <Header isPlaying={deckA.isPlaying || deckB.isPlaying} />

      {/* --- APP MAIN GRID --- */}
      <div className="app-grid">
        
        {/* --- LEFT SIDEBAR: LIBRARY MANAGER --- */}
        {/* --- LEFT SIDEBAR: LIBRARY MANAGER --- */}
        <LibraryPanel
          library={library}
          activeTrack={activeTrack}
          deckA={deckA}
          deckB={deckB}
          analyzingFile={analyzingFile}
          analyzingProgress={analyzingProgress}
          playedTrackIds={playedTrackIds}
          onLoadDemos={loadAllDemos}
          onFileUpload={handleFileUpload}
          onLoadTrack={loadTrackIntoDeck}
          onDeleteTrack={deleteTrack}
          djMode={djMode}
        />

        {/* --- CENTER SECTION: DECKS & MIXER --- */}
        <main className="decks-area">
          {/* Mix Master Panel */}
          <MixMaster
            masterBpm={masterBpm}
            onChangeMasterBpm={changeMasterBpm}
            library={library}
            djMode={djMode}
            onDjModeChange={setDjMode}
            eqOrder={eqOrder}
            onEqOrderChange={setEqOrder}
            sessionElapsedTime={sessionElapsedTime}
            activeTrack={activeTrack}
            transitionState={transitionState}
          />

          {/* Decks Grid */}
          <div className="decks-grid">
            <Deck
              deckId="A"
              deck={deckA}
              waveformData={waveformData.A}
              isActive={activeDeckId === 'A'}
              onTogglePlay={() => togglePlay('A')}
              onSeek={(percent) => seekTo('A', percent)}
              onJumpToOutro={() => jumpToOutro('A')}
              onPitchChange={(val) => handlePitchChange('A', val)}
              onToggleVinyl={() => toggleVinylMode('A')}
              onScratchStart={(isUpperHalf, clientX, clientY, rect) => startScratch('A', isUpperHalf, clientX, clientY, rect)}
              onScratchMove={(clientX, width) => updateScratch('A', clientX, width)}
              onScratchEnd={(isQuickClick, clickPercent) => stopScratch('A', isQuickClick, clickPercent)}
              accentColor="cyan"
              djMode={djMode}
            />
            <Deck
              deckId="B"
              deck={deckB}
              waveformData={waveformData.B}
              isActive={activeDeckId === 'B'}
              onTogglePlay={() => togglePlay('B')}
              onSeek={(percent) => seekTo('B', percent)}
              onJumpToOutro={() => jumpToOutro('B')}
              onPitchChange={(val) => handlePitchChange('B', val)}
              onToggleVinyl={() => toggleVinylMode('B')}
              onScratchStart={(isUpperHalf, clientX, clientY, rect) => startScratch('B', isUpperHalf, clientX, clientY, rect)}
              onScratchMove={(clientX, width) => updateScratch('B', clientX, width)}
              onScratchEnd={(isQuickClick, clickPercent) => stopScratch('B', isQuickClick, clickPercent)}
              accentColor="pink"
              djMode={djMode}
            />
          </div>

          {/* Central Mixer Panel */}
          <MixerPanel
            deckA={deckA}
            deckB={deckB}
            transitionActive={transitionState.active}
            onEqChange={handleEqChange}
            onVolumeChange={handleVolumeChange}
            onResync={resyncDecks}
            fxState={fxState}
            onUpdateFx={updateFx}
          />
        </main>

        {/* --- RIGHT SIDEBAR: CAMELOT DASHBOARD & LOGS --- */}
        <CamelotPanel
          activeTrack={activeTrack}
          transitionState={transitionState}
          logs={djLogs}
        />

      </div>
    </div>
  );
}
