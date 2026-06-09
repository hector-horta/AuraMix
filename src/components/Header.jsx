import React from 'react'
import { Disc } from 'lucide-react'
import './Header.css'

export default function Header({ isPlaying }) {
  return (
    <header className="panel">
      <div className="app-title-group">
        <Disc className={`logo-glow ${isPlaying ? 'autodj-icon' : ''}`} size={32} />
        <div>
          <h1>AuraMix Auto-DJ</h1>
          <p className="track-artist">Mezclador inteligente basado en Camelot Code y Web Audio API</p>
        </div>
      </div>
    </header>
  )
}
