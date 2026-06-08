import React from 'react'
import { Upload, Music, Trash2, RefreshCw } from 'lucide-react'
import { areKeysCompatible } from '../utils/audioAnalyzer'
import './LibraryPanel.css'

export default function LibraryPanel({
  library,
  activeTrack,
  deckA,
  deckB,
  analyzingFile,
  analyzingProgress,
  onLoadDemos,
  onFileUpload,
  onLoadTrack,
  onDeleteTrack
}) {
  return (
    <section className="panel library-panel">
      <div className="library-header">
        <h2 className="library-title">Selector</h2>
        {library.length === 0 && (
          <button 
            onClick={onLoadDemos} 
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
          onChange={onFileUpload}
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
                      onClick={() => onLoadTrack(track, 'A')}
                      className="load-deck-btn load-deck-btn-a"
                    >
                      Deck A
                    </button>
                    <button 
                      disabled={isLoadedOnA || isLoadedOnB}
                      onClick={() => onLoadTrack(track, 'B')}
                      className="load-deck-btn load-deck-btn-b"
                    >
                      Deck B
                    </button>
                  </div>

                  {/* Compatibility badge */}
                  {activeTrack && activeTrack.id !== track.id && (
                    <span className={`compatibility-status ${isCompatBpm && isCompatKey ? 'status-compatible' : 'status-incompatible'}`}>
                      {isCompatBpm && isCompatKey ? "✓ Compatible" : "Incompatible"}
                    </span>
                  )}

                  <button 
                    onClick={(e) => onDeleteTrack(track.id, e)}
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
  )
}
