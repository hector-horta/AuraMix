import { describe, it, expect, vi } from 'vitest';
import {
  deactivateAllFx,
  applyFilter,
  applyDelay,
  applyEcho,
  applyFlanger,
  applyBeatRepeat,
  applyTapeStop,
  updateFx
} from '../src/audio/fxEngine';

// Helper to create a full mock nodes object with all FX nodes
function createMockNodes() {
  const createParam = (val = 0) => ({
    value: val,
    setValueAtTime: vi.fn(function(v) { this.value = v; }),
    linearRampToValueAtTime: vi.fn(function(v) { this.value = v; }),
    cancelScheduledValues: vi.fn(),
  });

  return {
    fxInput: { gain: createParam(1) },
    filterNode: {
      type: 'lowpass',
      frequency: createParam(20000),
      Q: createParam(1),
    },
    fxDryGain: { gain: createParam(1) },
    delayNode: { delayTime: createParam(0.3) },
    delayFeedbackNode: { gain: createParam(0) },
    delayWetNode: { gain: createParam(0) },
    flangerLFO: { frequency: createParam(1) },
    flangerLFOGain: { gain: createParam(0) },
    flangerFeedbackNode: { gain: createParam(0) },
    flangerWetNode: { gain: createParam(0) },
    beatRepeatDelayNode: { delayTime: createParam(0.1) },
    beatRepeatFeedbackNode: { gain: createParam(0) },
    beatRepeatInputGainNode: { gain: createParam(1) },
    beatRepeatWetNode: { gain: createParam(0) },
    fxOutput: { gain: createParam(1) },
    source: {
      playbackRate: createParam(1),
    },
    pitch: 0,
  };
}

describe('deactivateAllFx', () => {
  it('should reset filter to lowpass at 20kHz', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    deactivateAllFx(nodes, ctx);

    expect(nodes.filterNode.type).toBe('lowpass');
    expect(nodes.filterNode.frequency.setValueAtTime).toHaveBeenCalledWith(20000, ctx.currentTime);
    expect(nodes.filterNode.Q.setValueAtTime).toHaveBeenCalledWith(1.0, ctx.currentTime);
  });

  it('should zero out all wet and feedback gains', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    deactivateAllFx(nodes, ctx);

    expect(nodes.delayWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
    expect(nodes.delayFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
    expect(nodes.flangerWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
    expect(nodes.flangerFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
    expect(nodes.beatRepeatWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
    expect(nodes.beatRepeatFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
  });

  it('should restore dry gain to 1.0', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    deactivateAllFx(nodes, ctx);

    expect(nodes.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1.0, ctx.currentTime);
  });

  it('should ramp playback rate back to normal when source exists', () => {
    const nodes = createMockNodes();
    nodes.pitch = 5; // +5% pitch
    const ctx = new AudioContext();

    deactivateAllFx(nodes, ctx);

    expect(nodes.source.playbackRate.cancelScheduledValues).toHaveBeenCalled();
    expect(nodes.source.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(
      1 + (5 / 100),
      ctx.currentTime + 0.3
    );
  });

  it('should handle missing source gracefully', () => {
    const nodes = createMockNodes();
    nodes.source = null;
    const ctx = new AudioContext();

    expect(() => deactivateAllFx(nodes, ctx)).not.toThrow();
  });
});

describe('applyFilter', () => {
  it('should set lowpass when x < 0.45', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyFilter(nodes, ctx, 0.2, 0.5);

    expect(nodes.filterNode.type).toBe('lowpass');
    expect(nodes.filterNode.frequency.setValueAtTime).toHaveBeenCalled();
    expect(nodes.filterNode.Q.setValueAtTime).toHaveBeenCalledWith(0.5 * 15, ctx.currentTime);
  });

  it('should set highpass when x > 0.55', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyFilter(nodes, ctx, 0.8, 0.3);

    expect(nodes.filterNode.type).toBe('highpass');
  });

  it('should set bypass (20kHz lowpass) when x is in dead zone (0.45-0.55)', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyFilter(nodes, ctx, 0.5, 0.5);

    expect(nodes.filterNode.type).toBe('lowpass');
    expect(nodes.filterNode.frequency.setValueAtTime).toHaveBeenCalledWith(20000, ctx.currentTime);
  });
});

describe('applyDelay', () => {
  it('should configure delay time and feedback from x and y', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyDelay(nodes, ctx, 0.5, 0.6);

    const expectedTime = 0.01 + 0.5 * 0.99;
    const expectedFb = 0.6 * 0.9;
    expect(nodes.delayNode.delayTime.setValueAtTime).toHaveBeenCalledWith(expectedTime, ctx.currentTime);
    expect(nodes.delayFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(expectedFb, ctx.currentTime);
    expect(nodes.delayWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, ctx.currentTime);
  });
});

describe('applyEcho', () => {
  it('should set delay time and wet/dry mix', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyEcho(nodes, ctx, 0.5, 0.7);

    const expectedTime = 0.2 + 0.5 * 1.8;
    expect(nodes.delayNode.delayTime.setValueAtTime).toHaveBeenCalledWith(expectedTime, ctx.currentTime);
    expect(nodes.delayFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(0.6, ctx.currentTime);
    expect(nodes.delayWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.7, ctx.currentTime);
    expect(nodes.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1.0 - 0.7 * 0.5, ctx.currentTime);
  });
});

describe('applyFlanger', () => {
  it('should configure LFO rate, depth, and feedback', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyFlanger(nodes, ctx, 0.5, 0.8);

    const expectedRate = 0.1 + 0.5 * 4.9;
    const expectedDepth = 0.8 * 0.01;
    expect(nodes.flangerLFO.frequency.setValueAtTime).toHaveBeenCalledWith(expectedRate, ctx.currentTime);
    expect(nodes.flangerLFOGain.gain.setValueAtTime).toHaveBeenCalledWith(expectedDepth, ctx.currentTime);
    expect(nodes.flangerFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(0.7, ctx.currentTime);
    expect(nodes.flangerWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, ctx.currentTime);
  });
});

describe('applyBeatRepeat', () => {
  it('should calculate beat repeat delay time from BPM and x position', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyBeatRepeat(nodes, ctx, 0.3, 0.8, 120, false);

    // x=0.3 → div=0.125
    const beatDuration = 60 / 120;
    const expectedTime = beatDuration * 0.125;
    expect(nodes.beatRepeatDelayNode.delayTime.setValueAtTime).toHaveBeenCalledWith(expectedTime, ctx.currentTime);
  });

  it('should freeze input and set high feedback on initial touch', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyBeatRepeat(nodes, ctx, 0.1, 0.5, 128, true);

    expect(nodes.beatRepeatInputGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
    expect(nodes.beatRepeatFeedbackNode.gain.setValueAtTime).toHaveBeenCalledWith(0.999, ctx.currentTime);
  });

  it('should NOT freeze input when not initial touch', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyBeatRepeat(nodes, ctx, 0.1, 0.5, 128, false);

    // beatRepeatInputGainNode should not be called with 0.0
    const calls = nodes.beatRepeatInputGainNode.gain.setValueAtTime.mock.calls;
    const zeroCall = calls.find(c => c[0] === 0.0);
    expect(zeroCall).toBeUndefined();
  });
});

describe('applyTapeStop', () => {
  it('should ramp playback rate to near-zero', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    applyTapeStop(nodes, ctx, 0.5);

    const stopDuration = 0.1 + 0.5 * 2.0;
    expect(nodes.source.playbackRate.cancelScheduledValues).toHaveBeenCalled();
    expect(nodes.source.playbackRate.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.0001,
      ctx.currentTime + stopDuration
    );
  });

  it('should do nothing if source is null', () => {
    const nodes = createMockNodes();
    nodes.source = null;
    const ctx = new AudioContext();

    expect(() => applyTapeStop(nodes, ctx, 0.5)).not.toThrow();
  });
});

describe('updateFx', () => {
  it('should call deactivateAllFx when active is false', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    updateFx(nodes, ctx, { active: false, type: 'Filter', x: 0.5, y: 0.5 });

    // Should have reset filter to bypass
    expect(nodes.filterNode.type).toBe('lowpass');
    expect(nodes.filterNode.frequency.setValueAtTime).toHaveBeenCalledWith(20000, ctx.currentTime);
  });

  it('should do nothing if fxInput is missing', () => {
    const nodes = createMockNodes();
    nodes.fxInput = null;
    const ctx = new AudioContext();

    expect(() => updateFx(nodes, ctx, { active: true, type: 'Filter', x: 0.5, y: 0.5 })).not.toThrow();
  });

  it('should apply Filter when type is Filter', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    updateFx(nodes, ctx, { active: true, type: 'Filter', x: 0.2, y: 0.6 });

    expect(nodes.filterNode.type).toBe('lowpass');
    expect(nodes.filterNode.Q.setValueAtTime).toHaveBeenCalledWith(0.6 * 15, ctx.currentTime);
  });

  it('should apply Delay and reset non-delay FX', () => {
    const nodes = createMockNodes();
    const ctx = new AudioContext();

    updateFx(nodes, ctx, { active: true, type: 'Delay', x: 0.5, y: 0.5 });

    expect(nodes.delayWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, ctx.currentTime);
    // Flanger should be reset
    expect(nodes.flangerWetNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, ctx.currentTime);
  });
});
