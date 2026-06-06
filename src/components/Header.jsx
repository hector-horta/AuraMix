import React from 'react'
import { Disc } from 'lucide-react'
import './Header.css'

export default function Header({ isPlaying, autoDj, libraryCount }) {
  return (
    <header className="panel">
      <div className="app-title-group">
        <Disc className={`logo-glow ${isPlaying ? 'autodj-icon' : ''}`} size={32} />
        <div>
          <h1>Moodsic Auto-DJ</h1>
          <p className="track-artist">Mezclador inteligente basado en Camelot Code y Web Audio API</p>
        </div>
      </div>
      <div className="header-status">
        {autoDj && <span className="badge-auto-dj">Auto-DJ Activo</span>}
        <div className="track-count">
          Biblioteca: {libraryCount} pistas
        </div>
      </div>
    </header>
  )
}
