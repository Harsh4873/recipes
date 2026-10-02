import { describe, expect, it } from 'vitest';
import { SWIPE_COMMIT_PX, SWIPE_FLICK_MIN_PX, swipeOutcome } from '../src/swipe';

describe('swipe decisions', () => {
  it('stays put on a short drag without a flick', () => {
    expect(swipeOutcome(20, 0.1)).toBe('stay');
    expect(swipeOutcome(-20, -0.1)).toBe('stay');
    expect(swipeOutcome(0, 4)).toBe('stay');
  });

  it('commits once the card has traveled far enough', () => {
    expect(swipeOutcome(SWIPE_COMMIT_PX, 0)).toBe('right');
    expect(swipeOutcome(-SWIPE_COMMIT_PX, 0)).toBe('left');
  });

  it('treats a fast flick as a choice only after a real movement', () => {
    expect(swipeOutcome(SWIPE_FLICK_MIN_PX, 0.8)).toBe('right');
    expect(swipeOutcome(-SWIPE_FLICK_MIN_PX, -0.8)).toBe('left');
    expect(swipeOutcome(8, 2)).toBe('stay');
    expect(swipeOutcome(-8, -2)).toBe('stay');
  });
});
