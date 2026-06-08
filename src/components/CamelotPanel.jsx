import React from 'react'
import ActivityLog from './ActivityLog'
import './CamelotPanel.css'

export default function CamelotPanel({
  activeTrack,
  transitionState,
  logs
}) {
  const activeKey = activeTrack ? activeTrack.key : null;

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

      {/* Compatibility explanation */}
      <div className="panel" style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
        <div className="compatibility-guide">
          <span className="eq-knob-label" style={{ fontWeight: 'bold' }}>Guía Armónica (Regla de Mezcla)</span>
          <p style={{ fontSize: '0.7rem' }}>Para transiciones fluidas sin disonancia armónica, mezcla canciones cuya clave sea:</p>
          <div className="guide-item">
            <div className="guide-dot dot-same"></div>
            <span>Misma tonalidad (ej. 8A ➔ 8A)</span>
          </div>
          <div className="guide-item">
            <div className="guide-dot dot-adjacent"></div>
            <span>Código contiguo en la rueda (ej. 8A ➔ 9A o 7A)</span>
          </div>
          <div className="guide-item">
            <div className="guide-dot dot-relative"></div>
            <span>Cambio de escala Relativa Mayor/Menor (ej. 8A ➔ 8B)</span>
          </div>
        </div>
      </div>

      {/* Live transition warning */}
      {transitionState.active && (
        <div className="autodj-transition-alert">
          ¡TRANSMISIÓN EN CURSO! ({transitionState.phase.toUpperCase()})
        </div>
      )}

      {/* Activity Logger */}
      <ActivityLog logs={logs} />
    </section>
  )
}
