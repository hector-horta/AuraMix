import { describe, it, expect } from 'vitest';
import { formatTime, formatRemainingTime } from '../src/utils/formatTime';

describe('Time Formatting Helpers', () => {
  describe('formatTime', () => {
    it('should format seconds into HH:MM:SS', () => {
      expect(formatTime(0)).toBe('00:00:00');
      expect(formatTime(5)).toBe('00:00:05');
      expect(formatTime(65)).toBe('00:01:05');
      expect(formatTime(3665)).toBe('01:01:05');
    });

    it('should handle invalid or negative values gracefully', () => {
      expect(formatTime(NaN)).toBe('00:00:00');
      expect(formatTime(-10)).toBe('00:00:00');
    });
  });

  describe('formatRemainingTime', () => {
    it('should format remaining seconds as a negative MM:SS string', () => {
      expect(formatRemainingTime(0)).toBe('-00:00');
      expect(formatRemainingTime(90)).toBe('-01:30'); // 1 min 30 secs
      expect(formatRemainingTime(5)).toBe('-00:05');
      expect(formatRemainingTime(330 - 240)).toBe('-01:30'); // User's example (5:30 duration, 4:00 outro)
    });

    it('should include hours if remaining seconds are 1 hour or more', () => {
      expect(formatRemainingTime(3690)).toBe('-01:01:30'); // 1 hour, 1 min, 30 secs
    });

    it('should handle invalid, NaN, or negative values gracefully', () => {
      expect(formatRemainingTime(NaN)).toBe('-00:00');
      expect(formatRemainingTime(-5)).toBe('-00:00');
    });
  });
});
