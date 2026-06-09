/**
 * FX Engine Module
 * Pure functions for configuring audio effects on Web Audio API nodes.
 */

/**
 * Deactivate all effects and reset nodes to bypass state.
 * @param {Object} nodes - The deck's audio node references.
 * @param {AudioContext} ctx - The Web Audio context.
 */
export function deactivateAllFx(nodes, ctx) {
  const t = ctx.currentTime;

  nodes.filterNode.type = 'lowpass';
  nodes.filterNode.frequency.setValueAtTime(20000, t);
  nodes.filterNode.Q.setValueAtTime(1.0, t);

  nodes.delayWetNode.gain.setValueAtTime(0.0, t);
  nodes.delayFeedbackNode.gain.setValueAtTime(0.0, t);

  nodes.flangerWetNode.gain.setValueAtTime(0.0, t);
  nodes.flangerFeedbackNode.gain.setValueAtTime(0.0, t);

  nodes.beatRepeatInputGainNode.gain.setValueAtTime(1.0, t);
  nodes.beatRepeatFeedbackNode.gain.setValueAtTime(0.0, t);
  nodes.beatRepeatWetNode.gain.setValueAtTime(0.0, t);
  nodes.fxDryGain.gain.setValueAtTime(1.0, t);

  // Restore playback rate smoothly
  if (nodes.source) {
    nodes.source.playbackRate.cancelScheduledValues(t);
    nodes.source.playbackRate.setValueAtTime(nodes.source.playbackRate.value, t);
    nodes.source.playbackRate.linearRampToValueAtTime(1 + (nodes.pitch / 100), t + 0.3);
  }
}

/**
 * Apply Filter effect (LP/HP based on X position, resonance from Y).
 */
export function applyFilter(nodes, ctx, x, y) {
  const t = ctx.currentTime;

  if (x < 0.45) {
    nodes.filterNode.type = 'lowpass';
    const freq = 20 + (x / 0.45) * 19980;
    nodes.filterNode.frequency.setValueAtTime(freq, t);
  } else if (x > 0.55) {
    nodes.filterNode.type = 'highpass';
    const freq = 20 + ((x - 0.55) / 0.45) * 19980;
    nodes.filterNode.frequency.setValueAtTime(freq, t);
  } else {
    nodes.filterNode.type = 'lowpass';
    nodes.filterNode.frequency.setValueAtTime(20000, t);
  }
  nodes.filterNode.Q.setValueAtTime(y * 15, t);
}

/**
 * Apply Delay effect.
 */
export function applyDelay(nodes, ctx, x, y) {
  const t = ctx.currentTime;
  const time = 0.01 + x * 0.99;
  const fb = y * 0.9;
  nodes.delayNode.delayTime.setValueAtTime(time, t);
  nodes.delayFeedbackNode.gain.setValueAtTime(fb, t);
  nodes.delayWetNode.gain.setValueAtTime(0.5, t);
  nodes.fxDryGain.gain.setValueAtTime(1.0, t);
}

/**
 * Apply Echo effect.
 */
export function applyEcho(nodes, ctx, x, y) {
  const t = ctx.currentTime;
  const time = 0.2 + x * 1.8;
  const mix = y;
  nodes.delayNode.delayTime.setValueAtTime(time, t);
  nodes.delayFeedbackNode.gain.setValueAtTime(0.6, t);
  nodes.delayWetNode.gain.setValueAtTime(mix, t);
  nodes.fxDryGain.gain.setValueAtTime(1.0 - mix * 0.5, t);
}

/**
 * Apply Flanger effect.
 */
export function applyFlanger(nodes, ctx, x, y) {
  const t = ctx.currentTime;
  const rate = 0.1 + x * 4.9;
  const depth = y * 0.01;
  nodes.flangerLFO.frequency.setValueAtTime(rate, t);
  nodes.flangerLFOGain.gain.setValueAtTime(depth, t);
  nodes.flangerFeedbackNode.gain.setValueAtTime(0.7, t);
  nodes.flangerWetNode.gain.setValueAtTime(0.5, t);
  nodes.fxDryGain.gain.setValueAtTime(1.0, t);
}

/**
 * Apply Beat Repeat effect.
 */
export function applyBeatRepeat(nodes, ctx, x, y, masterBpm, isInitialTouch) {
  const t = ctx.currentTime;
  const beatDuration = 60 / masterBpm;
  let div = 0.25;
  if (x < 0.2) div = 0.25;
  else if (x < 0.4) div = 0.125;
  else if (x < 0.6) div = 0.0625;
  else if (x < 0.8) div = 0.03125;
  else div = 0.015625;

  const time = beatDuration * div;
  nodes.beatRepeatDelayNode.delayTime.setValueAtTime(time, t);

  if (isInitialTouch) {
    nodes.beatRepeatInputGainNode.gain.setValueAtTime(0.0, t);
    nodes.beatRepeatFeedbackNode.gain.setValueAtTime(0.999, t);
  }

  const mix = y;
  nodes.beatRepeatWetNode.gain.setValueAtTime(mix, t);
  nodes.fxDryGain.gain.setValueAtTime(1.0 - mix, t);
}

/**
 * Apply Tape Stop effect (playback rate ramp to near-zero).
 */
export function applyTapeStop(nodes, ctx, x) {
  const t = ctx.currentTime;
  const stopDuration = 0.1 + x * 2.0;
  if (nodes.source) {
    nodes.source.playbackRate.cancelScheduledValues(t);
    nodes.source.playbackRate.setValueAtTime(nodes.source.playbackRate.value, t);
    nodes.source.playbackRate.linearRampToValueAtTime(0.0001, t + stopDuration);
  }
}

/**
 * Reset specific FX type nodes to inactive state (used before applying a new effect).
 */
function resetInactiveFx(nodes, ctx, activeType) {
  const t = ctx.currentTime;

  // Reset filter if not the active type
  if (activeType !== 'Filter') {
    nodes.filterNode.type = 'lowpass';
    nodes.filterNode.frequency.setValueAtTime(20000, t);
  }

  // Reset delay if not Delay or Echo
  if (activeType !== 'Delay' && activeType !== 'Echo') {
    nodes.delayWetNode.gain.setValueAtTime(0.0, t);
    nodes.delayFeedbackNode.gain.setValueAtTime(0.0, t);
  }

  // Reset flanger if not active
  if (activeType !== 'Flanger') {
    nodes.flangerWetNode.gain.setValueAtTime(0.0, t);
    nodes.flangerFeedbackNode.gain.setValueAtTime(0.0, t);
  }

  // Reset beat repeat if not active
  if (activeType !== 'Beat Repeat') {
    nodes.beatRepeatInputGainNode.gain.setValueAtTime(1.0, t);
    nodes.beatRepeatFeedbackNode.gain.setValueAtTime(0.0, t);
    nodes.beatRepeatWetNode.gain.setValueAtTime(0.0, t);
    if (activeType !== 'Echo') {
      nodes.fxDryGain.gain.setValueAtTime(1.0, t);
    }
  }
}

/**
 * Main FX update orchestrator. Routes to the correct apply function.
 * @param {Object} nodes - The deck's audio node references.
 * @param {AudioContext} ctx - The Web Audio context.
 * @param {Object} params - FX parameters.
 * @param {boolean} params.active - Whether FX is active.
 * @param {string} params.type - FX type name.
 * @param {number} params.x - X axis value (0-1).
 * @param {number} params.y - Y axis value (0-1).
 * @param {number} params.masterBpm - Current master BPM.
 * @param {boolean} params.isInitialTouch - Whether this is the initial touch event.
 */
export function updateFx(nodes, ctx, { active, type, x, y, masterBpm, isInitialTouch }) {
  if (!nodes.fxInput) return;

  if (!active) {
    deactivateAllFx(nodes, ctx);
    return;
  }

  // Apply the active effect
  if (type === 'Filter') applyFilter(nodes, ctx, x, y);
  if (type === 'Delay') applyDelay(nodes, ctx, x, y);
  if (type === 'Echo') applyEcho(nodes, ctx, x, y);
  if (type === 'Flanger') applyFlanger(nodes, ctx, x, y);
  if (type === 'Beat Repeat') applyBeatRepeat(nodes, ctx, x, y, masterBpm, isInitialTouch);
  if (type === 'Tape Stop') applyTapeStop(nodes, ctx, x);

  // Reset nodes for inactive FX types
  resetInactiveFx(nodes, ctx, type);
}
