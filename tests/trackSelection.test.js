import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findCompatibleTrack, createAutoloadScheduler } from '../src/audio/trackSelection';

// Mock areKeysCompatible since it's imported by trackSelection
vi.mock('../src/utils/audioAnalyzer', () => ({
  areKeysCompatible: (keyA, keyB) => {
    if (!keyA || !keyB) return false;
    if (keyA === keyB) return true;
    const numA = parseInt(keyA.slice(0, -1));
    const letterA = keyA.slice(-1);
    const numB = parseInt(keyB.slice(0, -1));
    const letterB = keyB.slice(-1);
    const isAdjacent = (numA === numB + 1 || numA === numB - 1 ||
      (numA === 12 && numB === 1) || (numA === 1 && numB === 12));
    if (letterA === letterB) return isAdjacent;
    return numA === numB;
  }
}));

// Helper factory for track objects
function makeTrack(id, bpm, key, title) {
  return { id, bpm, key, title: title || `Track ${id}` };
}

describe('findCompatibleTrack', () => {
  const currentTrack = makeTrack('t1', 128, '8A', 'Current Track');

  it('should return null when currentTrack is null', () => {
    expect(findCompatibleTrack(null, [], [], 'autodj')).toBeNull();
  });

  it('should return null when library is empty', () => {
    expect(findCompatibleTrack(currentTrack, [], [], 'autodj')).toBeNull();
  });

  it('should exclude the current track from results', () => {
    const library = [currentTrack]; // Only the current track itself
    expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toBeNull();
  });

  it('should find a compatible track by BPM (±5%) and Key', () => {
    const compatible = makeTrack('t2', 130, '8A'); // same key, BPM within 5%
    const library = [currentTrack, compatible];
    expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toEqual(compatible);
  });

  it('should reject tracks with BPM difference > 5%', () => {
    const tooFast = makeTrack('t2', 150, '8A'); // BPM diff ~17%
    const library = [currentTrack, tooFast];
    expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toBeNull();
  });

  it('should reject tracks with incompatible keys', () => {
    const wrongKey = makeTrack('t2', 128, '3A'); // key too far
    const library = [currentTrack, wrongKey];
    expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toBeNull();
  });

  it('should accept adjacent Camelot keys', () => {
    const adjacent = makeTrack('t2', 128, '7A'); // 7A is adjacent to 8A
    const library = [currentTrack, adjacent];
    expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toEqual(adjacent);
  });

  it('should accept relative major/minor (same number)', () => {
    const relative = makeTrack('t2', 128, '8B'); // 8B is relative major of 8A
    const library = [currentTrack, relative];
    expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toEqual(relative);
  });

  it('should prioritize unplayed tracks over played tracks', () => {
    const played = makeTrack('t2', 130, '8A', 'Played');
    const unplayed = makeTrack('t3', 126, '8A', 'Unplayed');
    const library = [currentTrack, played, unplayed];

    const result = findCompatibleTrack(currentTrack, library, ['t2'], 'autodj');
    expect(result.id).toBe('t3');
  });

  it('should fallback to played tracks when >= 75% of library is played', () => {
    const played = makeTrack('t2', 130, '8A', 'Played');
    const library = [currentTrack, played];
    // Both t1 and t2 played → t2 is a played candidate, playedRatio = 2/2 = 100%
    // t2 is compatible (BPM and key match), but already played → should fallback
    const result = findCompatibleTrack(currentTrack, library, ['t1', 't2'], 'autodj');
    expect(result).toEqual(played); // returns via fallback since 100% >= 75%

    // If played ratio < 75%, played candidates should NOT be returned
    const t3 = makeTrack('t3', 200, '1A', 'Incompatible'); // incompatible
    const t4 = makeTrack('t4', 200, '1A', 'Incompatible2');
    const t5 = makeTrack('t5', 200, '1A', 'Incompatible3');
    const bigLibrary = [currentTrack, played, t3, t4, t5];
    // playedTrackIds has 2 out of 5 = 40% → below 75%
    const result2 = findCompatibleTrack(currentTrack, bigLibrary, ['t1', 't2'], 'autodj');
    expect(result2).toBeNull(); // t2 played, but ratio too low for fallback
  });

  it('should return oldest played track first when falling back', () => {
    const t2 = makeTrack('t2', 130, '8A', 'Oldest');
    const t3 = makeTrack('t3', 126, '8A', 'Newer');
    const t4 = makeTrack('t4', 200, '1A', 'Filler');
    const library = [currentTrack, t2, t3, t4];

    // All compatible tracks played, 75% of library played
    const result = findCompatibleTrack(currentTrack, library, ['t1', 't2', 't3'], 'autodj');
    expect(result.id).toBe('t2'); // oldest played first
  });

  describe('Jukebox mode', () => {
    it('should ignore BPM constraint in jukebox mode', () => {
      const farBpm = makeTrack('t2', 80, '8A'); // BPM diff > 5% but key matches
      const library = [currentTrack, farBpm];

      // In autodj mode, this would be rejected
      expect(findCompatibleTrack(currentTrack, library, [], 'autodj')).toBeNull();

      // In jukebox mode, BPM is ignored
      expect(findCompatibleTrack(currentTrack, library, [], 'jukebox')).toEqual(farBpm);
    });
  });
});

describe('createAutoloadScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a scheduler with queue, cancel, cancelAll, getTimers', () => {
    const scheduler = createAutoloadScheduler(vi.fn(), vi.fn(), vi.fn());
    expect(scheduler.queue).toBeInstanceOf(Function);
    expect(scheduler.cancel).toBeInstanceOf(Function);
    expect(scheduler.cancelAll).toBeInstanceOf(Function);
    expect(scheduler.getTimers).toBeInstanceOf(Function);
  });

  it('should not queue when djMode is manual', () => {
    const findFn = vi.fn();
    const loadFn = vi.fn();
    const addLog = vi.fn();
    const scheduler = createAutoloadScheduler(findFn, loadFn, addLog);

    scheduler.queue('A', { title: 'test' }, 'manual');

    vi.advanceTimersByTime(15000);
    expect(findFn).not.toHaveBeenCalled();
    expect(loadFn).not.toHaveBeenCalled();
  });

  it('should queue and fire after 10 seconds', () => {
    const track = makeTrack('t1', 128, '8A');
    const compatible = makeTrack('t2', 130, '8A');
    const findFn = vi.fn(() => compatible);
    const loadFn = vi.fn();
    const addLog = vi.fn();
    const scheduler = createAutoloadScheduler(findFn, loadFn, addLog);

    scheduler.queue('B', track, 'autodj');

    // Not yet fired
    vi.advanceTimersByTime(9000);
    expect(loadFn).not.toHaveBeenCalled();

    // Now fires
    vi.advanceTimersByTime(1000);
    expect(findFn).toHaveBeenCalledWith(track);
    expect(loadFn).toHaveBeenCalledWith(compatible, 'B', false, true);
  });

  it('should cancel a specific deck timer', () => {
    const findFn = vi.fn(() => makeTrack('t2', 130, '8A'));
    const loadFn = vi.fn();
    const scheduler = createAutoloadScheduler(findFn, loadFn, vi.fn());

    scheduler.queue('A', makeTrack('t1', 128, '8A'), 'autodj');
    scheduler.cancel('A');

    vi.advanceTimersByTime(15000);
    expect(loadFn).not.toHaveBeenCalled();
  });

  it('should cancelAll timers', () => {
    const findFn = vi.fn(() => makeTrack('t2', 130, '8A'));
    const loadFn = vi.fn();
    const scheduler = createAutoloadScheduler(findFn, loadFn, vi.fn());

    scheduler.queue('A', makeTrack('t1', 128, '8A'), 'autodj');
    scheduler.queue('B', makeTrack('t1', 128, '8A'), 'autodj');
    scheduler.cancelAll();

    vi.advanceTimersByTime(15000);
    expect(loadFn).not.toHaveBeenCalled();
  });

  it('should log when no compatible track is found', () => {
    const findFn = vi.fn(() => null);
    const loadFn = vi.fn();
    const addLog = vi.fn();
    const scheduler = createAutoloadScheduler(findFn, loadFn, addLog);

    scheduler.queue('A', makeTrack('t1', 128, '8A'), 'autodj');

    vi.advanceTimersByTime(10000);
    expect(loadFn).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('No se encontró'));
  });

  it('should replace previous timer when queue is called again for same deck', () => {
    const findFn = vi.fn(() => makeTrack('t2', 130, '8A'));
    const loadFn = vi.fn();
    const scheduler = createAutoloadScheduler(findFn, loadFn, vi.fn());

    scheduler.queue('A', makeTrack('t1', 128, '8A'), 'autodj');
    vi.advanceTimersByTime(5000); // halfway through first timer

    // Queue again — should reset the 10s countdown
    scheduler.queue('A', makeTrack('t1', 128, '8A'), 'autodj');

    vi.advanceTimersByTime(5000); // 5s more — first timer would have fired, new one hasn't
    expect(loadFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000); // now 10s since the second queue call
    expect(loadFn).toHaveBeenCalledTimes(1);
  });
});
