import React from 'react'

export default function ActivityLog({ logs }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <span className="eq-knob-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Registro del Mezclador (Logs)</span>
      <div 
        style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '8px',
          padding: '0.75rem',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          height: '260px',
          overflowY: 'auto',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem'
        }}
      >
        {logs.map((log, i) => (
          <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.01)', paddingBottom: '0.15rem' }}>
            <span style={{ color: 'var(--text-dark)' }}>&gt;</span> {log}
          </div>
        ))}
      </div>
    </div>
  )
}
