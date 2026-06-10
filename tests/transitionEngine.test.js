import { describe, it, expect, vi } from 'vitest';
import {
  calculateTransitionTiming,
  calculateBeatAlignment,
  scheduleEqTransition,
  scheduleJukeboxTransition,
  scheduleAutoDjVolume,
  resetDeckEq,
  BAND_NODES,
  PHASE_DETAILS,
  scheduleEqualPowerCrossfade,
  scheduleBasslineSwap
} from '../src/audio/transitionEngine';

describe('calculateTransitionTiming', () => {
  it('should calculate correct phase boundaries', () => {
    const result = calculateTransitionTiming(
      /* deckDuration */ 300,
      /* outroTime */ 240,
      /* introTime */ 60,
      /* highPrecisionTime */ 241,
      /* delay */ 0.5,
      /* startTime */ 100.5
    );

    // outroDuration = max(10, 300 - 240) = 60
    // introDuration = max(10, 60) = 60
    // idealTransitionDuration = min(60, 60) = 60
    // remainingTime = max(2, 300 - (241 + 0.5)) = 58.5
    // transitionDuration = min(60, 58.5) = 58.5
    expect(result.transitionDuration).toBe(58.5);
    expect(result.phaseDuration).toBeCloseTo(19.5, 5);
    expect(result.t0).toBe(100.5);
    expect(result.t1).toBeCloseTo(120, 5);
    expect(result.t2).toBeCloseTo(139.5, 5);
    expect(result.t3).toBeCloseTo(159, 5);
  });

  it('should clamp transitionDuration to remainingTime', () => {
    const result = calculateTransitionTiming(
      /* deckDuration */ 100,
      /* outroTime */ 50,
      /* introTime */ 90,
      /* highPrecisionTime */ 95,
      /* delay */ 1,
      /* startTime */ 50
    );

    // remainingTime = max(2, 100 - (95 + 1)) = 4
    // outroDuration = max(10, 100 - 50) = 50
    // introDuration = max(10, 90) = 90
    // idealTransitionDuration = min(50, 90) = 50
    // transitionDuration = min(50, 4) = 4
    expect(result.transitionDuration).toBe(4);
  });

  it('should enforce minimum 10s for outro and intro durations', () => {
    const result = calculateTransitionTiming(
      /* deckDuration */ 105,
      /* outroTime */ 100, // only 5s left as outro
      /* introTime */ 3,    // only 3s intro
      /* highPrecisionTime */ 100,
      /* delay */ 0,
      /* startTime */ 50
    );

    expect(result.outroDuration).toBe(10); // clamped from 5 to 10
    expect(result.introDuration).toBe(10); // clamped from 3 to 10
  });

  it('should calculate correct 15-second Jukebox transition duration', () => {
    const result = calculateTransitionTiming(
      /* deckDuration */ 300,
      /* outroTime */ 240,
      /* introTime */ 60,
      /* highPrecisionTime */ 284.5,
      /* delay */ 0.5,
      /* startTime */ 100.5,
      /* djMode */ 'jukebox'
    );

    expect(result.transitionDuration).toBe(15);
    expect(result.phaseDuration).toBe(5);
    expect(result.t0).toBe(100.5);
    expect(result.t1).toBe(105.5);
    expect(result.t2).toBe(110.5);
    expect(result.t3).toBe(115.5);
    expect(result.outroDuration).toBe(15);
    expect(result.introDuration).toBe(15);
  });
});

describe('calculateBeatAlignment', () => {
  it('should return startTime in the future', () => {
    const ctx = new AudioContext();
    ctx.currentTime = 100;

    const nodesFrom = {
      startTime: 90,
      pausedAt: 0,
    };

    const fromTrack = { bpm: 120, firstBeatOffset: 0.0 };
    const targetTrack = { bpm: 120, firstBeatOffset: 0.0 };

    const result = calculateBeatAlignment(
      ctx, nodesFrom, fromTrack, 0, targetTrack, 0, 0, 120
    );

    expect(result.startTime).toBeGreaterThan(ctx.currentTime);
    expect(result.delay).toBeGreaterThan(0);
    expect(result.highPrecisionTime).toBeGreaterThanOrEqual(0);
  });

  it('should handle pitch offset correctly', () => {
    const ctx = new AudioContext();
    ctx.currentTime = 50;

    const nodesFrom = {
      startTime: 45,
      pausedAt: 0,
    };

    const fromTrack = { bpm: 128, firstBeatOffset: 0.1 };
    const targetTrack = { bpm: 126, firstBeatOffset: 0.05 };

    const result = calculateBeatAlignment(
      ctx, nodesFrom, fromTrack, 2.0, targetTrack, -1.5, 0, 128
    );

    expect(result.startTime).toBeGreaterThan(ctx.currentTime);
    expect(typeof result.delay).toBe('number');
    expect(typeof result.highPrecisionTime).toBe('number');
  });
});

describe('scheduleEqTransition', () => {
  it('should call setValueAtTime and linearRampToValueAtTime for each phase', () => {
    const createGainParam = () => ({
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      }
    });

    const nodesFrom = {
      lowShelf: createGainParam(),
      midPeaking: createGainParam(),
      highShelf: createGainParam(),
    };

    const nodesTo = {
      lowShelf: createGainParam(),
      midPeaking: createGainParam(),
      highShelf: createGainParam(),
    };

    const eqOrder = ['mid', 'low', 'high'];
    const times = [10, 20, 30, 40]; // [t0, t1, t2, t3]
    const fromEq = { low: 0, mid: 0, high: 0 };

    scheduleEqTransition(nodesFrom, nodesTo, eqOrder, times, fromEq);

    // Phase 0: mid swaps (j=0, p=0)
    expect(nodesFrom.midPeaking.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(nodesFrom.midPeaking.gain.linearRampToValueAtTime).toHaveBeenCalledWith(-40, 20);
    expect(nodesTo.midPeaking.gain.setValueAtTime).toHaveBeenCalledWith(-40, 10);
    expect(nodesTo.midPeaking.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 20);

    // Phase 1: low swaps (j=1, p=1)
    expect(nodesFrom.lowShelf.gain.setValueAtTime).toHaveBeenCalledWith(0, 20);
    expect(nodesFrom.lowShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(-40, 30);
    expect(nodesTo.lowShelf.gain.setValueAtTime).toHaveBeenCalledWith(-40, 20);
    expect(nodesTo.lowShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 30);

    // Phase 2: high swaps (j=2, p=2)
    expect(nodesFrom.highShelf.gain.setValueAtTime).toHaveBeenCalledWith(0, 30);
    expect(nodesFrom.highShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(-40, 40);
    expect(nodesTo.highShelf.gain.setValueAtTime).toHaveBeenCalledWith(-40, 30);
    expect(nodesTo.highShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 40);
  });

  it('should handle different EQ orders correctly', () => {
    const createGainParam = () => ({
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      }
    });

    const nodesFrom = {
      lowShelf: createGainParam(),
      midPeaking: createGainParam(),
      highShelf: createGainParam(),
    };
    const nodesTo = {
      lowShelf: createGainParam(),
      midPeaking: createGainParam(),
      highShelf: createGainParam(),
    };

    // Different order: high first, then mid, then low
    const eqOrder = ['high', 'mid', 'low'];
    const times = [0, 10, 20, 30];
    const fromEq = { low: -5, mid: 3, high: -2 };

    scheduleEqTransition(nodesFrom, nodesTo, eqOrder, times, fromEq);

    // Phase 0: high swaps first
    expect(nodesFrom.highShelf.gain.setValueAtTime).toHaveBeenCalledWith(-2, 0);
    expect(nodesFrom.highShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(-40, 10);
  });
});

describe('scheduleJukeboxTransition', () => {
  it('should schedule volume crossfade and pitch ramp', () => {
    const nodesFrom = {
      gainNode: { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } },
      source: { playbackRate: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } },
    };
    const nodesTo = {
      gainNode: { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } },
    };

    scheduleJukeboxTransition(nodesFrom, nodesTo, 10, 40, 1.0, 130, 128, 1.0);

    // Incoming: 0 → 1
    expect(nodesTo.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, 10);
    expect(nodesTo.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, 40);

    // Outgoing: 1 → 0
    expect(nodesFrom.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 10);
    expect(nodesFrom.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.0, 40);

    // Pitch ramp
    expect(nodesFrom.source.playbackRate.setValueAtTime).toHaveBeenCalledWith(1.0, 10);
    expect(nodesFrom.source.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(130 / 128, 40);
  });
});

describe('scheduleAutoDjVolume', () => {
  it('should keep both volumes constant during EQ transition', () => {
    const nodesFrom = {
      gainNode: { gain: { setValueAtTime: vi.fn() } },
    };
    const nodesTo = {
      gainNode: { gain: { setValueAtTime: vi.fn() } },
    };

    scheduleAutoDjVolume(nodesFrom, nodesTo, 10, 40, 0.8);

    expect(nodesTo.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 10);
    expect(nodesTo.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 40);
    expect(nodesFrom.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 10);
    expect(nodesFrom.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 40);
  });
});

describe('resetDeckEq', () => {
  it('should reset all EQ and gain to flat (0 dB, 1.0 gain)', () => {
    const nodesFrom = {
      lowShelf: { gain: { value: -40 } },
      midPeaking: { gain: { value: -40 } },
      highShelf: { gain: { value: -40 } },
      gainNode: { gain: { value: 0.5 } },
    };

    resetDeckEq(nodesFrom);

    expect(nodesFrom.lowShelf.gain.value).toBe(0);
    expect(nodesFrom.midPeaking.gain.value).toBe(0);
    expect(nodesFrom.highShelf.gain.value).toBe(0);
    expect(nodesFrom.gainNode.gain.value).toBe(1.0);
  });
});

describe('BAND_NODES constant', () => {
  it('should map band names to node property names', () => {
    expect(BAND_NODES.low).toBe('lowShelf');
    expect(BAND_NODES.mid).toBe('midPeaking');
    expect(BAND_NODES.high).toBe('highShelf');
  });
});

describe('PHASE_DETAILS constant', () => {
  it('should contain details for mid, low, and high', () => {
    expect(PHASE_DETAILS.mid.phase).toBe('mids');
    expect(PHASE_DETAILS.low.phase).toBe('lows');
    expect(PHASE_DETAILS.high.phase).toBe('highs');
    expect(PHASE_DETAILS.mid.msg).toContain('medias');
    expect(PHASE_DETAILS.low.msg).toContain('bajas');
    expect(PHASE_DETAILS.high.msg).toContain('altas');
  });
});

describe('scheduleEqualPowerCrossfade', () => {
  it('should schedule equal-power volume curves on both decks', () => {
    const nodesFrom = {
      gainNode: { gain: { cancelScheduledValues: vi.fn(), setValueCurveAtTime: vi.fn() } },
    };
    const nodesTo = {
      gainNode: { gain: { cancelScheduledValues: vi.fn(), setValueCurveAtTime: vi.fn() } },
    };

    scheduleEqualPowerCrossfade(nodesFrom, nodesTo, 10, 40, 0.8);

    expect(nodesFrom.gainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(nodesFrom.gainNode.gain.setValueCurveAtTime).toHaveBeenCalledWith(
      expect.any(Float32Array), 10, 30
    );

    expect(nodesTo.gainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(nodesTo.gainNode.gain.setValueCurveAtTime).toHaveBeenCalledWith(
      expect.any(Float32Array), 10, 30
    );
  });
});

describe('scheduleBasslineSwap', () => {
  it('should swap the low EQ at the midpoint and keep other EQs flat/initial', () => {
    const createGainParam = () => ({
      gain: {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      }
    });

    const nodesFrom = {
      lowShelf: createGainParam(),
      midPeaking: createGainParam(),
      highShelf: createGainParam(),
    };
    const nodesTo = {
      lowShelf: createGainParam(),
      midPeaking: createGainParam(),
      highShelf: createGainParam(),
    };

    const fromEq = { low: -2, mid: 3, high: 1 };
    // t0 = 10, t3 = 40, t_mid = 25
    scheduleBasslineSwap(nodesFrom, nodesTo, 10, 40, fromEq);

    // Cancel calls
    expect(nodesFrom.lowShelf.gain.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(nodesTo.lowShelf.gain.cancelScheduledValues).toHaveBeenCalledWith(10);

    // Low EQ (Bass Swap) at t_mid = 25
    expect(nodesFrom.lowShelf.gain.setValueAtTime).toHaveBeenCalledWith(-2, 10);
    expect(nodesFrom.lowShelf.gain.setValueAtTime).toHaveBeenCalledWith(-2, 25);
    expect(nodesFrom.lowShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(-40, 25.05);

    expect(nodesTo.lowShelf.gain.setValueAtTime).toHaveBeenCalledWith(-40, 10);
    expect(nodesTo.lowShelf.gain.setValueAtTime).toHaveBeenCalledWith(-40, 25);
    expect(nodesTo.lowShelf.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 25.05);

    // Mids / Highs
    expect(nodesFrom.midPeaking.gain.setValueAtTime).toHaveBeenCalledWith(3, 10);
    expect(nodesFrom.highShelf.gain.setValueAtTime).toHaveBeenCalledWith(1, 10);

    expect(nodesTo.midPeaking.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(nodesTo.highShelf.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
  });
});
