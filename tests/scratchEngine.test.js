import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleScratchStart,
  handleScratchUpdate,
  handleScratchStop
} from '../src/audio/scratchEngine';

function createMockRefs() {
  return {
    isScratchingRef: { current: { A: false, B: false } },
    dragModeRef: { current: { A: null, B: null } },
    lastXRef: { current: { A: 0, B: 0 } },
    lastTimeRef: { current: { A: 0, B: 0 } },
    bendTimeoutRef: { current: { A: null, B: null } },
  };
}

function createMockNodes(hasBuffer = true, hasSource = true) {
  const createParam = (val = 1) => ({
    value: val,
    setValueAtTime: vi.fn(function(v) { this.value = v; }),
    linearRampToValueAtTime: vi.fn(function(v) { this.value = v; }),
    cancelScheduledValues: vi.fn(),
  });

  return {
    buffer: hasBuffer ? { duration: 300 } : null,
    source: hasSource ? {
      playbackRate: createParam(1),
      start: vi.fn(),
      stop: vi.fn(),
    } : null,
    pitch: 0,
    pausedAt: 50,
    startTime: 40,
    lowShelf: { connect: vi.fn() },
  };
}

describe('handleScratchStart', () => {
  it('should return null if no buffer', () => {
    const nodes = createMockNodes(false);
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { vinylMode: true, isPlaying: true };

    const result = handleScratchStart(nodes, ctx, deck, true, 100, refs, 'A', vi.fn());
    expect(result).toBeNull();
  });

  it('should activate scratch mode when vinyl mode + upper half', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { vinylMode: true, isPlaying: true };

    const result = handleScratchStart(nodes, ctx, deck, true, 200, refs, 'A', vi.fn());

    expect(result).toBe('scratch');
    expect(refs.isScratchingRef.current.A).toBe(true);
    expect(refs.dragModeRef.current.A).toBe('scratch');
    expect(refs.lastXRef.current.A).toBe(200);
  });

  it('should activate bend mode when not upper half', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { vinylMode: true, isPlaying: true };

    const result = handleScratchStart(nodes, ctx, deck, false, 150, refs, 'B', vi.fn());

    expect(result).toBe('bend');
    expect(refs.dragModeRef.current.B).toBe('bend');
    expect(refs.lastXRef.current.B).toBe(150);
  });

  it('should activate bend mode when vinyl mode is off', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { vinylMode: false, isPlaying: true };

    const result = handleScratchStart(nodes, ctx, deck, true, 100, refs, 'A', vi.fn());

    expect(result).toBe('bend');
  });

  it('should call playDeckSource when not playing in scratch mode', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { vinylMode: true, isPlaying: false };
    const playDeckSource = vi.fn();

    handleScratchStart(nodes, ctx, deck, true, 100, refs, 'A', playDeckSource);

    expect(playDeckSource).toHaveBeenCalledWith('A', 0, -100);
  });

  it('should ramp playback rate to near-zero when playing in scratch mode', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { vinylMode: true, isPlaying: true };

    handleScratchStart(nodes, ctx, deck, true, 100, refs, 'A', vi.fn());

    expect(nodes.source.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(0.01, ctx.currentTime + 0.18);
  });
});

describe('handleScratchUpdate', () => {
  it('should return null if no buffer or source', () => {
    const nodes = createMockNodes(false);
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { currentTime: 50, duration: 300 };

    expect(handleScratchUpdate(nodes, ctx, deck, 100, 500, refs, 'A')).toBeNull();
  });

  it('should return null if no drag mode is active', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = null;
    const deck = { currentTime: 50, duration: 300 };

    expect(handleScratchUpdate(nodes, ctx, deck, 100, 500, refs, 'A')).toBeNull();
  });

  it('should update playback rate and return newTime in scratch mode', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = 'scratch';
    refs.isScratchingRef.current.A = true;
    refs.lastXRef.current.A = 100;
    refs.lastTimeRef.current.A = performance.now() - 16; // ~16ms ago (60fps)

    const deck = { currentTime: 50, duration: 300 };
    const result = handleScratchUpdate(nodes, ctx, deck, 120, 500, refs, 'A');

    // With a 20px dx over ~16ms, should produce some rate change
    expect(result).not.toBeNull();
    expect(result.newTime).toBeGreaterThanOrEqual(0.05);
    expect(result.newTime).toBeLessThanOrEqual(299.95);
  });

  it('should clamp scratch rate between -4 and 4', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = 'scratch';
    refs.isScratchingRef.current.A = true;
    refs.lastXRef.current.A = 0;
    // Set last time to very recently so dt is very small → huge velocity
    refs.lastTimeRef.current.A = performance.now() - 1;

    const deck = { currentTime: 150, duration: 300 };
    handleScratchUpdate(nodes, ctx, deck, 500, 500, refs, 'A');

    const rate = nodes.source.playbackRate.value;
    expect(rate).toBeGreaterThanOrEqual(-4.0);
    expect(rate).toBeLessThanOrEqual(4.0);
  });

  it('should adjust playback rate in bend mode without returning newTime', () => {
    const nodes = createMockNodes();
    nodes.pitch = 2; // +2%
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = 'bend';
    refs.lastXRef.current.A = 200;
    refs.lastTimeRef.current.A = performance.now() - 16;

    const deck = { currentTime: 50, duration: 300 };
    const result = handleScratchUpdate(nodes, ctx, deck, 220, 500, refs, 'A');

    expect(result).toBeNull(); // bend mode doesn't return newTime
    // Playback rate should have been adjusted
    const normalRate = 1 + (2 / 100);
    expect(nodes.source.playbackRate.value).not.toBe(normalRate); // Should be bent
  });
});

describe('handleScratchStop', () => {
  it('should call seekFn on quick click', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { isPlaying: true };
    const seekFn = vi.fn();

    handleScratchStop(nodes, ctx, deck, true, 0.5, refs, 'A', seekFn, vi.fn(), vi.fn());

    expect(seekFn).toHaveBeenCalledWith('A', 0.5);
  });

  it('should restore playback rate and call playDeckSource after scratch while playing', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = 'scratch';
    refs.isScratchingRef.current.A = true;
    const deck = { isPlaying: true };
    const playDeckSource = vi.fn();

    handleScratchStop(nodes, ctx, deck, false, 0, refs, 'A', vi.fn(), playDeckSource, vi.fn());

    expect(playDeckSource).toHaveBeenCalledWith('A');
    expect(refs.isScratchingRef.current.A).toBe(false);
    expect(refs.dragModeRef.current.A).toBeNull();
  });

  it('should call stopDeckSource after scratch while paused', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = 'scratch';
    const deck = { isPlaying: false };
    const stopDeckSource = vi.fn();

    handleScratchStop(nodes, ctx, deck, false, 0, refs, 'A', vi.fn(), vi.fn(), stopDeckSource);

    expect(stopDeckSource).toHaveBeenCalledWith('A');
  });

  it('should restore normal rate after bend', () => {
    const nodes = createMockNodes();
    nodes.pitch = 3;
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.A = 'bend';
    const deck = { isPlaying: true };

    handleScratchStop(nodes, ctx, deck, false, 0, refs, 'A', vi.fn(), vi.fn(), vi.fn());

    const expectedRate = 1 + (3 / 100);
    expect(nodes.source.playbackRate.value).toBe(expectedRate);
  });

  it('should clean up refs after stop', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();
    const refs = createMockRefs();
    refs.dragModeRef.current.B = 'scratch';
    refs.isScratchingRef.current.B = true;
    refs.bendTimeoutRef.current.B = setTimeout(() => {}, 1000);
    const deck = { isPlaying: true };

    handleScratchStop(nodes, ctx, deck, false, 0, refs, 'B', vi.fn(), vi.fn(), vi.fn());

    expect(refs.dragModeRef.current.B).toBeNull();
    expect(refs.isScratchingRef.current.B).toBe(false);
    expect(refs.bendTimeoutRef.current.B).toBeNull();
  });

  it('should do nothing if no buffer', () => {
    const nodes = createMockNodes(false);
    const ctx = new AudioContext();
    const refs = createMockRefs();
    const deck = { isPlaying: true };

    expect(() => handleScratchStop(nodes, ctx, deck, false, 0, refs, 'A', vi.fn(), vi.fn(), vi.fn())).not.toThrow();
  });
});
