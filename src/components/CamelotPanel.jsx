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

      {/* Activity Logger */}
      <ActivityLog logs={logs} />
    </section>
  )
}

