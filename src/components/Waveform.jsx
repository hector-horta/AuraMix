import React, { useRef, useEffect } from 'react'
import { formatTime } from '../utils/formatTime'
import './Waveform.css'

export default function Waveform({
  peaks,
  currentTime,
  duration,
  introTime,
  outroTime,
  playedColor,
  unplayedColor,
  vinylMode,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
  onSeek
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);
    const progressLimit = duration > 0 ? (currentTime / duration) * width : 0;

    const barWidth = width / peaks.length;
    peaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = peak * height * 0.9;
      const y = (height - barHeight) / 2;

      if (x < progressLimit) {
        ctx.fillStyle = playedColor;
      } else {
        ctx.fillStyle = unplayedColor;
      }
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });

    // Draw scratch/nudge zone dividers and overlays when vinyl mode is active
    if (vinylMode) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = '7px monospace';
      ctx.fillText('SCRATCH ZONE', 8, 11);
      ctx.fillText('NUDGE ZONE', 8, height - 6);
    }
  }, [peaks, currentTime, duration, playedColor, unplayedColor, vinylMode]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    
    const isTouch = e.type === 'touchstart';
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const clickY = clientY - rect.top;
    const isUpperHalf = clickY < rect.height / 2;

    const startTime = performance.now();
    const startX = clientX;

    onScratchStart(isUpperHalf, clientX, clientY, rect);

    const handleMouseMove = (moveEvent) => {
      const currentX = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientX : moveEvent.clientX;
      onScratchMove(currentX, rect.width);
    };

    const handleMouseUp = (upEvent) => {
      const endX = upEvent.type === 'touchend' ? upEvent.changedTouches[0].clientX : upEvent.clientX;
      
      const distance = Math.abs(endX - startX);
      const elapsed = performance.now() - startTime;
      
      const isQuickClick = distance < 6 && elapsed < 220;
      const clickPercent = Math.max(0, Math.min(1.0, (endX - rect.left) / rect.width));

      onScratchEnd(isQuickClick, clickPercent);

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: true });
    window.addEventListener('touchend', handleMouseUp);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const introPercent = duration > 0 ? (introTime / duration) * 100 : 0;
  const outroPercent = duration > 0 ? (outroTime / duration) * 100 : 0;

  return (
    <div className="waveform-wrapper">
      {/* Cue time indicators outside the waveform */}
      {duration > 0 && introTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${introPercent}%` }}
        >
          {formatTime(introTime)}
        </span>
      )}
      {duration > 0 && outroTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${outroPercent}%` }}
        >
          {formatTime(outroTime)}
        </span>
      )}

      <div 
        className="waveform-container" 
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        {peaks ? (
          <canvas className="waveform-canvas" ref={canvasRef} />
        ) : (
          <div className="waveform-placeholder" />
        )}
        
        {/* Play progress bar */}
        <div className="waveform-progress-bar" style={{ left: `${progressPercent}%` }} />

        {/* Intro Cue marker */}
        {duration > 0 && introTime > 0 && (
          <>
            <div 
              className="intro-marker" 
              style={{ left: `${introPercent}%` }}
            />
            <span 
              className="intro-label"
              style={{ left: `${introPercent}%` }}
            >
              DROP
            </span>
          </>
        )}

        {/* Outro Cue marker */}
        {duration > 0 && outroTime > 0 && (
          <>
            <div 
              className="outro-marker" 
              style={{ left: `${outroPercent}%` }}
            />
            <span 
              className="outro-label"
              style={{ left: `${outroPercent}%` }}
            >
              OUTRO
            </span>
          </>
        )}
      </div>
    </div>
  )
}
