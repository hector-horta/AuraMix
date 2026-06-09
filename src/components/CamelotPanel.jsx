import React from 'react'
import ActivityLog from './ActivityLog'
import { GENRE_PROFILES } from '../utils/audioAnalyzer'
import './CamelotPanel.css'

export default function CamelotPanel({
  activeTrack,
  transitionState,
  logs
}) {
  const activeKey = activeTrack ? activeTrack.key : null;
  const activeGenre = activeTrack ? activeTrack.genre : null;

  return (
    <section className="panel camelot-panel">
      <div className="camelot-header">
        <h2 className="camelot-title">Dashboard Camelot</h2>
      </div>
      <div>
        {activeTrack ? (
          <div className="active-camelot-card">
            <div className="active-camelot-key">{activeKey}</div>
            <div className="active-camelot-name">{activeTrack.keyName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Tema en vivo: "{activeTrack.title}"
            </div>
          </div>
        ) : (
          <div className="active-camelot-card active-camelot-card-empty">
            Haz sonar una canción para ver su tonalidad Camelot.
          </div>
        )}
      </div>

      {/* Estilos Musicales / Perfiles de Género */}
      <div className="genre-profiles-section">
        <span className="eq-knob-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Detector de Estilo Musical</span>
        <div className="genre-profile-grid">
          {GENRE_PROFILES.map((profile) => {
            const isActive = activeGenre === profile.name;
            return (
              <div 
                key={profile.name}
                className={`genre-profile-card ${isActive ? 'active' : ''}`}
                style={isActive ? {
                  borderColor: profile.color,
                  color: profile.color,
                  boxShadow: `0 0 12px ${profile.color}55, inset 0 0 6px ${profile.color}22`,
                  textShadow: `0 0 6px ${profile.color}bb`,
                  opacity: 1
                } : {}}
              >
                <span className="genre-profile-emoji">{profile.emoji}</span>
                <span className="genre-profile-name">{profile.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Activity Logger */}
      <ActivityLog logs={logs} />
    </section>
  )
}
