import { describe, it, expect, vi } from 'vitest';
import { areKeysCompatible } from '../src/utils/analyzers/keyMatcher';
import { detectBPM } from '../src/utils/analyzers/bpmDetector';
import { detectKey } from '../src/utils/analyzers/keyDetector';
import { detectOutro, detectIntro, detectHighsPosition } from '../src/utils/analyzers/structureDetector';
import * as audioAnalyzerHub from '../src/utils/audioAnalyzer';

describe('keyMatcher: areKeysCompatible', () => {
  it('should return true for identical keys', () => {
    expect(areKeysCompatible('8A', '8A')).toBe(true);
    expect(areKeysCompatible('1B', '1B')).toBe(true);
  });

  it('should return true for adjacent Camelot numbers in the same mode', () => {
    expect(areKeysCompatible('8A', '9A')).toBe(true);
    expect(areKeysCompatible('8A', '7A')).toBe(true);
    expect(areKeysCompatible('12A', '1A')).toBe(true);
    expect(areKeysCompatible('1A', '12A')).toBe(true);
  });

  it('should return true for relative Major/Minor swap (same number, different letter)', () => {
    expect(areKeysCompatible('8A', '8B')).toBe(true);
    expect(areKeysCompatible('5B', '5A')).toBe(true);
  });

  it('should return false for incompatible keys', () => {
    expect(areKeysCompatible('8A', '10A')).toBe(false);
    expect(areKeysCompatible('8A', '9B')).toBe(false);
    expect(areKeysCompatible(null, '8A')).toBe(false);
    expect(areKeysCompatible('8A', '')).toBe(false);
  });
});

describe('audioAnalyzer re-export hub', () => {
  it('should export all analyzer functions from the hub', () => {
    expect(typeof audioAnalyzerHub.detectBPM).toBe('function');
    expect(typeof audioAnalyzerHub.detectKey).toBe('function');
    expect(typeof audioAnalyzerHub.detectOutro).toBe('function');
    expect(typeof audioAnalyzerHub.detectIntro).toBe('function');
    expect(typeof audioAnalyzerHub.detectHighsPosition).toBe('function');
    expect(typeof audioAnalyzerHub.areKeysCompatible).toBe('function');
  });
});

describe('bpmDetector: detectBPM', () => {
  it('should return fallback BPM when peaks count is low', async () => {
    const channelData = new Float32Array(22050 * 5); // 5 seconds silent buffer
    const mockAudioBuffer = {
      duration: 5,
      sampleRate: 22050,
      numberOfChannels: 1,
      getChannelData: () => channelData
    };

    const result = await detectBPM(mockAudioBuffer);
    expect(result).toHaveProperty('bpm');
    expect(result).toHaveProperty('firstBeatOffset');
    expect(result.bpm).toBe(120);
  });
});

describe('structureDetector: detectOutro & detectIntro', () => {
  it('should calculate valid outro timestamp within track limits', () => {
    const channelData = new Float32Array(44100 * 120); // 120s buffer
    const mockAudioBuffer = {
      duration: 120,
      sampleRate: 44100,
      getChannelData: () => channelData
    };

    const outroTime = detectOutro(mockAudioBuffer);
    expect(outroTime).toBeGreaterThanOrEqual(0);
    expect(outroTime).toBeLessThanOrEqual(120);
  });

  it('should calculate valid intro timestamp', () => {
    const channelData = new Float32Array(44100 * 120);
    const mockAudioBuffer = {
      duration: 120,
      sampleRate: 44100,
      getChannelData: () => channelData
    };

    const introTime = detectIntro(mockAudioBuffer, 128);
    expect(introTime).toBeGreaterThanOrEqual(4);
    expect(introTime).toBeLessThanOrEqual(90);
  });
});
