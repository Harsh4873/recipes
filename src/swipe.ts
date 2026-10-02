export const SWIPE_COMMIT_PX = 96;
export const SWIPE_FLICK_PX_PER_MS = 0.65;
export const SWIPE_FLICK_MIN_PX = 36;

export type SwipeOutcome = 'left' | 'right' | 'stay';

export function swipeOutcome(distancePx: number, velocityPxPerMs: number): SwipeOutcome {
  const flickedRight = distancePx >= SWIPE_FLICK_MIN_PX && velocityPxPerMs >= SWIPE_FLICK_PX_PER_MS;
  const flickedLeft = distancePx <= -SWIPE_FLICK_MIN_PX && velocityPxPerMs <= -SWIPE_FLICK_PX_PER_MS;
  if (distancePx >= SWIPE_COMMIT_PX || flickedRight) return 'right';
  if (distancePx <= -SWIPE_COMMIT_PX || flickedLeft) return 'left';
  return 'stay';
}
