import React, { useState } from 'react';
import './EqOrderPills.css';

export default function EqOrderPills({ eqOrder, onOrderChange, disabled }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Set text data for compatibility
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e, index) => {
    if (disabled) return;
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, index) => {
    if (disabled || draggedIndex === null) return;
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === index) return;

    const newOrder = [...eqOrder];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);
    
    onOrderChange(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const labels = {
    low: 'LOWS',
    mid: 'MIDS',
    high: 'HIGHS'
  };

  return (
    <div className={`eq-order-container ${disabled ? 'disabled' : ''}`}>
      <div className="section-label eq-order-label">Precedencia EQ</div>
      <div className="eq-order-pills-list">
        {eqOrder.map((band, idx) => (
          <div
            key={band}
            className={`eq-pill eq-pill-${band} ${draggedIndex === idx ? 'dragging' : ''} ${dragOverIndex === idx ? 'drag-over' : ''}`}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            title={disabled ? "Activa Auto-DJ para cambiar el orden" : "Arrastra para cambiar la precedencia de la mezcla"}
          >
            <span className="eq-pill-num">{idx + 1}°</span>
            <span className="eq-pill-text">{labels[band]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
