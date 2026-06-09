import { describe, it, expect } from 'vitest';
import { extractSpectralFeatures, classifyGenre, detectGenre, GENRE_PROFILES } from '../src/utils/audioAnalyzer';

describe('Genre Detection Module', () => {
  describe('extractSpectralFeatures', () => {
    it('should extract correct spectral features from mock audio buffer', () => {
      // Create a mock audio buffer with 44100 * 35 samples (35 seconds)
      const sampleRate = 44100;
      const duration = 35;
      const length = sampleRate * duration;
      const data = new Float32Array(length);

      // Populate data with a simple synthetic waveform (e.g. 100 Hz low frequency to create some bass energy)
      for (let i = 0; i < length; i++) {
        // A simple low-frequency sine wave + noise
        data[i] = Math.sin(2 * Math.PI * 100 * i / sampleRate) * 0.5 + (Math.random() - 0.5) * 0.1;
      }

      // Add mock percussive peaks every 0.5 seconds (representing 120 BPM / 2 Hz peak interval)
      const peakInterval = Math.floor(sampleRate * 0.5);
      for (let i = 0; i < length; i += peakInterval) {
        // create a transient/peak envelope
        for (let j = 0; j < Math.min(2000, length - i); j++) {
          data[i + j] += Math.exp(-j / 500) * 0.8;
        }
      }

      const mockBuffer = {
        duration,
        sampleRate,
        numberOfChannels: 1,
        length,
        getChannelData: () => data
      };

      const features = extractSpectralFeatures(mockBuffer);
      
      expect(features.spectralCentroid).toBeGreaterThan(0);
      expect(features.bassEnergyRatio).toBeGreaterThanOrEqual(0);
      expect(features.bassEnergyRatio).toBeLessThanOrEqual(1.0);
      expect(features.onsetDensity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('classifyGenre', () => {
    it('should classify Drum & Bass with high BPM', () => {
      // DnB profile: BPM around 170, high bass, high onset
      const features = {
        spectralCentroid: 3000,
        bassEnergyRatio: 0.50,
        onsetDensity: 8.0
      };
      
      const result = classifyGenre(170, features);
      expect(result.genre).toBe('Drum & Bass');
      expect(result.confidence).toBeGreaterThanOrEqual(50);
    });

    it('should classify Techno with four-on-the-floor BPM and high centroid/onset', () => {
      // Techno profile: BPM around 135, high centroid, high bass, high onset
      const features = {
        spectralCentroid: 3750,
        bassEnergyRatio: 0.45,
        onsetDensity: 6.5
      };
      
      const result = classifyGenre(135, features);
      expect(result.genre).toBe('Techno');
    });

    it('should classify Ambient with low BPM and low onset density', () => {
      // Ambient profile: BPM around 80, low onset, low centroid
      const features = {
        spectralCentroid: 1500,
        bassEnergyRatio: 0.18,
        onsetDensity: 1.0
      };
      
      const result = classifyGenre(80, features);
      expect(result.genre).toBe('Ambient/Chill');
    });

    it('should classify Progressive House with 126 BPM and characteristic features', () => {
      // Progressive House: BPM around 125, bass ratio around 0.28, centroid around 3000
      const features = {
        spectralCentroid: 3000,
        bassEnergyRatio: 0.28,
        onsetDensity: 4.5
      };
      
      const result = classifyGenre(126, features);
      expect(result.genre).toBe('Progressive House');
    });

    it('should classify Indie/Rock with 120 BPM and guitar/acoustic features', () => {
      // Indie/Rock: BPM around 120, low bass ratio (0.16), higher centroid (3900)
      const features = {
        spectralCentroid: 3900,
        bassEnergyRatio: 0.16,
        onsetDensity: 4.2
      };
      
      const result = classifyGenre(120, features);
      expect(result.genre).toBe('Indie/Rock');
    });

    it('should always return a valid confidence between 10 and 100', () => {
      const features = {
        spectralCentroid: 2500,
        bassEnergyRatio: 0.3,
        onsetDensity: 4.5
      };
      
      const result = classifyGenre(128, features);
      expect(result.confidence).toBeGreaterThanOrEqual(10);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('detectGenre Integration', () => {
    it('should handle buffer processing errors and return fallback', () => {
      // An invalid or empty buffer causing getChannelData to throw
      const badBuffer = {
        duration: 10,
        sampleRate: 44100,
        getChannelData: () => { throw new Error("Mock decode error"); }
      };

      const result = detectGenre(badBuffer, 120);
      expect(result.genre).toBe('Ambient/Chill');
      expect(result.confidence).toBe(20);
    });
  });
});
