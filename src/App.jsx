import React, { useRef, useEffect } from 'react';
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
  const engineInitAudioRef = useRef(null);

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
    fxState,
    updateFx,
    toggleVinylMode,
    updateDeckCuePoints,
    autoloadCountdown,
    autoloadNotification,
    dismissAutoloadNotification,
    toggleDeckLoop
  } = audioEngine;

  useEffect(() => {
    engineInitAudioRef.current = initAudio;
  }, [initAudio]);

  const activeTrack = activeDeckId === 'A' ? deckA.track : deckB.track;

  return (
    <div className="container">
      <Header isPlaying={deckA.isPlaying || deckB.isPlaying} />

      <div className="app-grid">
        <LibraryPanel
          library={library}
          activeTrack={activeTrack}
          deckATrackId={deckA.track?.id}
          deckAPlaying={deckA.isPlaying}
          deckBTrackId={deckB.track?.id}
          deckBPlaying={deckB.isPlaying}
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
              onMarkerMove={(deckId, markerType, newTime) => updateDeckCuePoints(deckId, markerType, newTime)}
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
              onMarkerMove={(deckId, markerType, newTime) => updateDeckCuePoints(deckId, markerType, newTime)}
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
