/**
 * Vitest Setup File
 * Provides global mocks for Web Audio API so tests can run without a browser.
 */

function createMockAudioParam(defaultValue = 0) {
  return {
    value: defaultValue,
    defaultValue,
    minValue: -3.4028234663852886e+38,
    maxValue: 3.4028234663852886e+38,
    setValueAtTime: vi.fn(function (value) { this.value = value; return this; }),
    linearRampToValueAtTime: vi.fn(function (value) { this.value = value; return this; }),
    exponentialRampToValueAtTime: vi.fn(function (value) { this.value = value; return this; }),
    setTargetAtTime: vi.fn(function () { return this; }),
    setValueCurveAtTime: vi.fn(function () { return this; }),
    cancelScheduledValues: vi.fn(function () { return this; }),
    cancelAndHoldAtTime: vi.fn(function () { return this; }),
  };
}

function createMockGainNode() {
  const node = {
    gain: createMockAudioParam(1),
    connect: vi.fn(() => node),
    disconnect: vi.fn(),
    context: null,
    numberOfInputs: 1,
    numberOfOutputs: 1,
  };
  return node;
}

function createMockBiquadFilterNode() {
  const node = {
    type: 'lowpass',
    frequency: createMockAudioParam(350),
    Q: createMockAudioParam(1),
    gain: createMockAudioParam(0),
    detune: createMockAudioParam(0),
    connect: vi.fn(() => node),
    disconnect: vi.fn(),
  };
  return node;
}

function createMockDelayNode(maxDelay = 1.0) {
  const node = {
    delayTime: createMockAudioParam(0),
    connect: vi.fn(() => node),
    disconnect: vi.fn(),
  };
  return node;
}

function createMockOscillatorNode() {
  const node = {
    type: 'sine',
    frequency: createMockAudioParam(440),
    detune: createMockAudioParam(0),
    connect: vi.fn(() => node),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return node;
}

function createMockBufferSourceNode() {
  const node = {
    buffer: null,
    playbackRate: createMockAudioParam(1),
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    connect: vi.fn(() => node),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
  return node;
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = { connect: vi.fn(), disconnect: vi.fn() };
  }

  createGain() {
    return createMockGainNode();
  }

  createBiquadFilter() {
    return createMockBiquadFilterNode();
  }

  createDelay(maxDelay) {
    return createMockDelayNode(maxDelay);
  }

  createOscillator() {
    return createMockOscillatorNode();
  }

  createBufferSource() {
    return createMockBufferSourceNode();
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }

  decodeAudioData(buffer, successCb, errorCb) {
    const mockBuffer = {
      duration: 180,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 44100 * 180,
      getChannelData: () => new Float32Array(44100 * 180),
    };
    if (successCb) successCb(mockBuffer);
    return Promise.resolve(mockBuffer);
  }
}

// Register globally
globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;

// Export factory functions for tests that need individual node mocks
globalThis.__testMocks = {
  createMockAudioParam,
  createMockGainNode,
  createMockBiquadFilterNode,
  createMockDelayNode,
  createMockOscillatorNode,
  createMockBufferSourceNode,
  MockAudioContext,
};
