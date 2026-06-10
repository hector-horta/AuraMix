import React, { useRef, useEffect } from 'react'
import { formatTime, formatRemainingTime } from '../utils/formatTime'
import './Waveform.css'

export default function Waveform({
  peaks,
  currentTime,
  duration,
  introTime,
  outroTime,
  cueTime,
  playedColor,
  unplayedColor,
  vinylMode,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
  onSeek,
  onMarkerMove,
  activeLoopBars,
  loopStart,
  loopEnd,
  djMode = 'autodj'
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

    // Draw loop region highlight overlay on top of waveform
    if (activeLoopBars && duration > 0) {
      const startX = (loopStart / duration) * width;
      const endX = (loopEnd / duration) * width;
      
      // Draw transparent neon orange overlay region
      ctx.fillStyle = 'rgba(255, 159, 28, 0.12)';
      ctx.fillRect(startX, 0, endX - startX, height);

      // Draw dotted borders at loop boundaries
      ctx.strokeStyle = 'var(--neon-orange)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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
  }, [peaks, currentTime, duration, playedColor, unplayedColor, vinylMode, activeLoopBars, loopStart, loopEnd]);

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

  const handleMarkerStart = (markerType, e) => {
    e.stopPropagation();
    e.preventDefault();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const isTouch = e.type === 'touchstart';
    
    const handleMove = (moveEvent) => {
      const clientX = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const percent = Math.max(0, Math.min(1.0, (clientX - rect.left) / rect.width));
      const newTime = percent * duration;
      if (onMarkerMove) {
        onMarkerMove(markerType, newTime);
      }
    };
    
    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    
    if (isTouch) {
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    } else {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const introPercent = duration > 0 ? (introTime / duration) * 100 : 0;
  const outroPercent = duration > 0 ? (outroTime / duration) * 100 : 0;
  const cuePercent = duration > 0 ? (cueTime / duration) * 100 : 0;

  return (
    <div className="waveform-wrapper">
      {/* Cue time indicators outside the waveform */}
      {djMode !== 'jukebox' && duration > 0 && cueTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${cuePercent}%` }}
        >
          {formatTime(cueTime)}
        </span>
      )}
      {djMode !== 'jukebox' && duration > 0 && introTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${introPercent}%` }}
        >
          {formatTime(introTime)}
        </span>
      )}
      {djMode !== 'jukebox' && duration > 0 && outroTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${outroPercent}%` }}
        >
          {formatRemainingTime(duration - outroTime)}
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
        <div 
          className={`waveform-progress-bar ${activeLoopBars ? 'looping' : ''}`} 
          style={{ left: `${progressPercent}%` }} 
        />

        {/* CUE Point marker */}
        {djMode !== 'jukebox' && duration > 0 && cueTime !== undefined && (
          <div 
            className="cue-marker-container"
            style={{ left: `${cuePercent}%` }}
            onMouseDown={(e) => handleMarkerStart('cue', e)}
            onTouchStart={(e) => handleMarkerStart('cue', e)}
          >
            <div className="cue-marker" />
            <span className="cue-label">CUE</span>
          </div>
        )}

        {/* Intro Cue marker */}
        {djMode !== 'jukebox' && duration > 0 && introTime > 0 && (
          <div 
            className="cue-marker-container"
            style={{ left: `${introPercent}%` }}
            onMouseDown={(e) => handleMarkerStart('drop', e)}
            onTouchStart={(e) => handleMarkerStart('drop', e)}
          >
            <div className="intro-marker" />
            <span className="intro-label">DROP</span>
          </div>
        )}

        {/* Outro Cue marker */}
        {djMode !== 'jukebox' && duration > 0 && outroTime > 0 && (
          <div 
            className="cue-marker-container"
            style={{ left: `${outroPercent}%` }}
            onMouseDown={(e) => handleMarkerStart('outro', e)}
            onTouchStart={(e) => handleMarkerStart('outro', e)}
          >
            <div className="outro-marker" />
            <span className="outro-label">OUTRO</span>
          </div>
        )}
      </div>
    </div>
  )
}
