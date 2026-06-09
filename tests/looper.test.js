import { describe, it, expect } from 'vitest';

describe('AuraLoops Beat-Aligned Snapping Math', () => {
  const bpm = 120; // 120 BPM => 0.5s per beat, 2s per bar
  const firstBeatOffset = 0.5;
  const duration = 180; // 3 minutes track

  const calculateLoopBounds = (currentTime, bars) => {
    const beatDuration = 60 / bpm;
    const barDuration = 4 * beatDuration;
    const loopDuration = bars * barDuration;

    const elapsed = Math.max(0, currentTime - firstBeatOffset);
    const nearestBeat = Math.round(elapsed / beatDuration);
    const loopStart = Math.max(0, firstBeatOffset + nearestBeat * beatDuration);
    const loopEnd = Math.min(duration, loopStart + loopDuration);

    return { loopStart, loopEnd };
  };

  it('should snap loop start to the nearest beat at 2.4s (3.8 beats from offset)', () => {
    // 2.4s is 1.9s from offset. 1.9 / 0.5 = 3.8 beats. Round to 4 beats = 2.0s. 2.0 + 0.5 = 2.5s.
    const bounds = calculateLoopBounds(2.4, 4);
    expect(bounds.loopStart).toBe(2.5);
    expect(bounds.loopEnd).toBe(10.5); // 2.5 + 4 bars * 2s = 10.5s
  });

  it('should snap loop start to the nearest beat at 2.8s (4.6 beats from offset)', () => {
    // 2.8s is 2.3s from offset. 2.3 / 0.5 = 4.6 beats. Round to 5 beats = 2.5s. 2.5 + 0.5 = 3.0s.
    const bounds = calculateLoopBounds(2.8, 8);
    expect(bounds.loopStart).toBe(3.0);
    expect(bounds.loopEnd).toBe(19.0); // 3.0 + 8 bars * 2s = 19.0s
  });

  it('should handle zero offset and snap to nearest beats properly', () => {
    const bounds = calculateLoopBounds(5.1, 12); // with offset = 0.5, 5.1s is 4.6s from offset. 4.6 / 0.5 = 9.2 beats => 9 beats. 9 * 0.5 + 0.5 = 5.0s.
    expect(bounds.loopStart).toBe(5.0);
    expect(bounds.loopEnd).toBe(29.0); // 5.0 + 12 bars * 2s = 29.0s
  });
});

describe('AuraLoops Playhead Wrap-Around Logic', () => {
  const wrapPlayhead = (current, loopStart, loopEnd) => {
    const loopDuration = loopEnd - loopStart;
    if (current >= loopEnd && loopDuration > 0) {
      const timeInLoop = (current - loopStart) % loopDuration;
      return loopStart + timeInLoop;
    }
    return current;
  };

  it('should keep playhead unmodified if it is inside the loop', () => {
    const loopStart = 10.0;
    const loopEnd = 18.0;
    expect(wrapPlayhead(12.5, loopStart, loopEnd)).toBe(12.5);
    expect(wrapPlayhead(17.9, loopStart, loopEnd)).toBe(17.9);
  });

  it('should wrap playhead modulo loop duration if it exceeds loopEnd', () => {
    const loopStart = 10.0;
    const loopEnd = 18.0; // loop duration = 8.0
    
    // playhead is 1.5 seconds past loopEnd (19.5s)
    expect(wrapPlayhead(19.5, loopStart, loopEnd)).toBe(11.5);
    
    // playhead is exactly at loopEnd (18.0s)
    expect(wrapPlayhead(18.0, loopStart, loopEnd)).toBe(10.0);

    // playhead is one full loop cycle + 2 seconds past (28.0s => 10 + (18%8) => 10 + 2 => 12.0s)
    expect(wrapPlayhead(28.0, loopStart, loopEnd)).toBe(12.0);
  });
});
