import React from 'react';
import Header from './components/Header';
import LibraryPanel from './components/LibraryPanel';
import MixMaster from './components/MixMaster';
import Deck from './components/Deck';
import MixerPanel from './components/MixerPanel';
import AutoloadToast from './components/AutoloadToast';
import { useLibraryManager } from './hooks/useLibraryManager';
import { useAudioEngine } from './hooks/useAudioEngine';

const addLog = (msg) => console.log("[DJ Engine]", msg);

export default function App() {
  // Audio engine forward declaration helper for library manager
  const audioCtxRefPlaceholder = React.useRef(null);
  const initAudioPlaceholder = React.useCallback(() => {}, []);

  const {
    library,
    analyzingFile,
    analyzingProgress,
    updateTrackCuePoints,
    handleFileUpload,
    loadAllDemos,
    deleteTrack,
    clearLibrary
  } = useLibraryManager({
    initAudio: () => engineInitAudioRef.current?.(),
    audioCtxRef: audioCtxRefPlaceholder,
    addLog
  });

  const audioEngine = useAudioEngine({
    library,
    addLog,
    onUpdateTrackCuePoints: updateTrackCuePoints
  });

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
    autoDjStyle,
    setAutoDjStyle,
    eqOrder,
    setEqOrder,
    resyncDecks,
    playedTrackIds,
    sessionElapsedTime,
    activeDeckId,
    initAudio,
    audioCtxRef,
    fxState,
    updateFx,
    toggleVinylMode,
    updateDeckCuePoints,
    autoloadCountdown,
    autoloadNotification,
    dismissAutoloadNotification,
    toggleDeckLoop
  } = audioEngine;

  // Sync refs for library manager initialization
  audioCtxRefPlaceholder.current = audioCtxRef.current;
  const engineInitAudioRef = React.useRef(initAudio);
  React.useEffect(() => {
    engineInitAudioRef.current = initAudio;
    audioCtxRefPlaceholder.current = audioCtxRef.current;
  });

  const activeTrack = activeDeckId === 'A' ? deckA.track : deckB.track;

  return (
    <div className="container">
      <Header isPlaying={deckA.isPlaying || deckB.isPlaying} />

      <div className="app-grid">
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
          onClearLibrary={clearLibrary}
          djMode={djMode}
        />

        <main className="decks-area">
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
              onMarkerMove={(markerType, newTime) => updateDeckCuePoints('A', markerType, newTime)}
              accentColor="cyan"
              djMode={djMode}
              autoloadSecondsLeft={autoloadCountdown.A}
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
              onMarkerMove={(markerType, newTime) => updateDeckCuePoints('B', markerType, newTime)}
              accentColor="pink"
              djMode={djMode}
              autoloadSecondsLeft={autoloadCountdown.B}
            />
          </div>

          <MixerPanel
            deckA={deckA}
            deckB={deckB}
            transitionActive={transitionState.active}
            onEqChange={handleEqChange}
            onVolumeChange={handleVolumeChange}
            onResync={resyncDecks}
            fxState={fxState}
            onUpdateFx={updateFx}
            djMode={djMode}
            autoDjStyle={autoDjStyle}
            onChangeAutoDjStyle={setAutoDjStyle}
            onToggleLoop={toggleDeckLoop}
          />
        </main>
      </div>

      <AutoloadToast
        notification={autoloadNotification}
        onDismiss={dismissAutoloadNotification}
      />
    </div>
  );
}
