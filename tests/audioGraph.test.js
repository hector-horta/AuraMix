import { describe, it, expect, vi } from 'vitest';
import { createDeckGraph } from '../src/audio/audioGraph';

describe('createDeckGraph', () => {
  it('should return an object with all expected audio nodes', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    // EQ nodes
    expect(graph.lowShelf).toBeDefined();
    expect(graph.midPeaking).toBeDefined();
    expect(graph.highShelf).toBeDefined();
    expect(graph.gainNode).toBeDefined();

    // FX nodes
    expect(graph.fxInput).toBeDefined();
    expect(graph.fxDryGain).toBeDefined();
    expect(graph.filterNode).toBeDefined();
    expect(graph.delayNode).toBeDefined();
    expect(graph.delayFeedbackNode).toBeDefined();
    expect(graph.delayWetNode).toBeDefined();
    expect(graph.flangerNode).toBeDefined();
    expect(graph.flangerLFO).toBeDefined();
    expect(graph.flangerLFOGain).toBeDefined();
    expect(graph.flangerFeedbackNode).toBeDefined();
    expect(graph.flangerWetNode).toBeDefined();
    expect(graph.beatRepeatDelayNode).toBeDefined();
    expect(graph.beatRepeatFeedbackNode).toBeDefined();
    expect(graph.beatRepeatInputGainNode).toBeDefined();
    expect(graph.beatRepeatWetNode).toBeDefined();
    expect(graph.fxOutput).toBeDefined();
  });

  it('should set correct initial filter types and frequencies', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.lowShelf.type).toBe('lowshelf');
    expect(graph.lowShelf.frequency.value).toBe(250);

    expect(graph.midPeaking.type).toBe('peaking');
    expect(graph.midPeaking.frequency.value).toBe(1000);
    expect(graph.midPeaking.Q.value).toBe(1.0);

    expect(graph.highShelf.type).toBe('highshelf');
    expect(graph.highShelf.frequency.value).toBe(4000);
  });

  it('should set filter node to lowpass at 20kHz', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.filterNode.type).toBe('lowpass');
    expect(graph.filterNode.frequency.value).toBe(20000);
    expect(graph.filterNode.Q.value).toBe(1.0);
  });

  it('should initialize dry gain to 1.0', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.fxDryGain.gain.value).toBe(1.0);
  });

  it('should initialize all wet gains to 0.0 (effects off)', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.delayWetNode.gain.value).toBe(0.0);
    expect(graph.flangerWetNode.gain.value).toBe(0.0);
    expect(graph.beatRepeatWetNode.gain.value).toBe(0.0);
  });

  it('should initialize all feedback gains to 0.0', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.delayFeedbackNode.gain.value).toBe(0.0);
    expect(graph.flangerFeedbackNode.gain.value).toBe(0.0);
    expect(graph.beatRepeatFeedbackNode.gain.value).toBe(0.0);
  });

  it('should call connect to build the audio graph chain', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    // Verify key connections were made
    expect(graph.lowShelf.connect).toHaveBeenCalledWith(graph.midPeaking);
    expect(graph.midPeaking.connect).toHaveBeenCalledWith(graph.highShelf);
    expect(graph.highShelf.connect).toHaveBeenCalledWith(graph.fxInput);
    expect(graph.fxOutput.connect).toHaveBeenCalledWith(graph.gainNode);
  });

  it('should start the flanger LFO oscillator', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.flangerLFO.start).toHaveBeenCalled();
  });

  it('should connect gainNode to destination', () => {
    const ctx = new AudioContext();
    const graph = createDeckGraph(ctx);

    expect(graph.gainNode.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('should produce two independent graphs for two decks', () => {
    const ctx = new AudioContext();
    const graphA = createDeckGraph(ctx);
    const graphB = createDeckGraph(ctx);

    // They should be different object instances
    expect(graphA.lowShelf).not.toBe(graphB.lowShelf);
    expect(graphA.gainNode).not.toBe(graphB.gainNode);
    expect(graphA.filterNode).not.toBe(graphB.filterNode);
  });
});
