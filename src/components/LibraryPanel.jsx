import React from 'react'
import { Upload, Music, RefreshCw } from 'lucide-react'
import TrackInfo from './TrackInfo'
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
          library.map((track) => (
            <TrackInfo
              key={track.id}
              track={track}
              activeTrack={activeTrack}
              deckA={deckA}
              deckB={deckB}
              onLoadTrack={onLoadTrack}
              onDeleteTrack={onDeleteTrack}
            />
          ))
        )}
      </div>
    </section>
  )
}
