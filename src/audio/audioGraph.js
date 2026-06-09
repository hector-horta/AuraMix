/**
 * Audio Graph Factory
 * Creates the Web Audio API node graph for a single deck.
 * This eliminates the duplicated Deck A / Deck B graph code in useAudioEngine.
 */

/**
 * Creates and connects all audio nodes for a single deck.
 * @param {AudioContext} ctx - The Web Audio API context.
 * @returns {Object} An object containing all created and connected audio nodes.
 */
export function createDeckGraph(ctx) {
  // --- EQ Nodes ---
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 250;

  const midPeaking = ctx.createBiquadFilter();
  midPeaking.type = 'peaking';
  midPeaking.frequency.value = 1000;
  midPeaking.Q.value = 1.0;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 4000;

  const gainNode = ctx.createGain();

  // --- FX Nodes ---
  const fxInput = ctx.createGain();
  const fxDryGain = ctx.createGain();
  fxDryGain.gain.value = 1.0;

  // Filter
  const filterNode = ctx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 20000;
  filterNode.Q.value = 1.0;

  // Delay/Echo
  const delayNode = ctx.createDelay(2.0);
  delayNode.delayTime.value = 0.3;
  const delayFeedbackNode = ctx.createGain();
  delayFeedbackNode.gain.value = 0.0;
  const delayWetNode = ctx.createGain();
  delayWetNode.gain.value = 0.0;

  // Flanger
  const flangerNode = ctx.createDelay(0.1);
  flangerNode.delayTime.value = 0.005;
  const flangerLFOGain = ctx.createGain();
  flangerLFOGain.gain.value = 0.0;
  const flangerFeedbackNode = ctx.createGain();
  flangerFeedbackNode.gain.value = 0.0;
  const flangerWetNode = ctx.createGain();
  flangerWetNode.gain.value = 0.0;
  const flangerLFO = ctx.createOscillator();
  flangerLFO.type = 'sine';
  flangerLFO.frequency.value = 1.0;

  // Beat Repeat
  const beatRepeatDelayNode = ctx.createDelay(1.0);
  beatRepeatDelayNode.delayTime.value = 0.1;
  const beatRepeatFeedbackNode = ctx.createGain();
  beatRepeatFeedbackNode.gain.value = 0.0;
  const beatRepeatInputGainNode = ctx.createGain();
  beatRepeatInputGainNode.gain.value = 1.0;
  const beatRepeatWetNode = ctx.createGain();
  beatRepeatWetNode.gain.value = 0.0;

  const fxOutput = ctx.createGain();

  // --- Connections ---
  // EQ chain: lowShelf → midPeaking → highShelf → fxInput
  lowShelf.connect(midPeaking);
  midPeaking.connect(highShelf);
  highShelf.connect(fxInput);
  fxInput.connect(filterNode);

  // Dry Path
  filterNode.connect(fxDryGain);
  fxDryGain.connect(fxOutput);

  // Delay/Echo Path
  filterNode.connect(delayNode);
  delayNode.connect(delayFeedbackNode);
  delayFeedbackNode.connect(delayNode);
  delayNode.connect(delayWetNode);
  delayWetNode.connect(fxOutput);

  // Flanger Path
  filterNode.connect(flangerNode);
  flangerLFO.connect(flangerLFOGain);
  flangerLFOGain.connect(flangerNode.delayTime);
  flangerNode.connect(flangerFeedbackNode);
  flangerFeedbackNode.connect(flangerNode);
  flangerNode.connect(flangerWetNode);
  flangerWetNode.connect(fxOutput);

  // Beat Repeat Path
  filterNode.connect(beatRepeatInputGainNode);
  beatRepeatInputGainNode.connect(beatRepeatDelayNode);
  beatRepeatDelayNode.connect(beatRepeatFeedbackNode);
  beatRepeatFeedbackNode.connect(beatRepeatDelayNode);
  beatRepeatDelayNode.connect(beatRepeatWetNode);
  beatRepeatWetNode.connect(fxOutput);

  // Start LFO oscillator
  flangerLFO.start();

  // Output chain: fxOutput → gainNode → destination
  fxOutput.connect(gainNode);
  gainNode.connect(ctx.destination);

  return {
    lowShelf,
    midPeaking,
    highShelf,
    gainNode,
    fxInput,
    fxDryGain,
    filterNode,
    delayNode,
    delayFeedbackNode,
    delayWetNode,
    flangerNode,
    flangerLFO,
    flangerLFOGain,
    flangerFeedbackNode,
    flangerWetNode,
    beatRepeatDelayNode,
    beatRepeatFeedbackNode,
    beatRepeatInputGainNode,
    beatRepeatWetNode,
    fxOutput
  };
}
