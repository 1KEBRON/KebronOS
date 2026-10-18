// Adaptive quality for the live ocean: pixel-ratio bounds per device class, a render-scale controller driven by
// measured frame intervals (with hysteresis), and the frame-rate policy. Pure, so it is unit-tested on its own.

export type PixelRatioBounds = { min: number; start: number; max: number };

/** Ceiling, starting point and floor for the canvas pixel ratio. Phones and tablets stay low to keep them cool. */
export function pixelRatioBounds(devicePixelRatio: number, compact: boolean): PixelRatioBounds {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const max = Math.min(dpr, compact ? 1.25 : 1.5);
  const start = Math.min(max, compact ? 1 : 1.25);
  const min = Math.min(start, compact ? 0.5 : 0.6);
  return { min, start, max };
}

export type FrameRateInput = {
  /** Ocean-only (immersive) view. */
  immersive: boolean;
  /** A pointer is down or the camera is still easing toward where the visitor sent it. */
  interacting: boolean;
  /** Windows cover the whole viewport; the sea only shows through their blurred glass. */
  covered: boolean;
};

export const ACTIVE_FPS = 60;
export const IDLE_FPS = 30;
export const COVERED_FPS = 15;

/** Full rate when someone is looking or touching, half rate while the sea is just a backdrop, less behind windows. */
export function targetFps({ immersive, interacting, covered }: FrameRateInput): number {
  if (immersive || interacting) return ACTIVE_FPS;
  return covered ? COVERED_FPS : IDLE_FPS;
}

export type RenderScaleOptions = PixelRatioBounds & {
  /** Seconds of frames per evaluation window. */
  windowMs?: number;
  /** Disable the "give up and show the still image" decision. */
  neverGiveUp?: boolean;
  /** Give up when frames stay slower than this at the lowest pixel ratio (default 14 fps). */
  giveUpFps?: number;
};

/**
 * Feed it the interval between rendered frames and the interval it should have been; it lowers the pixel ratio
 * when frames are late and raises it again after sustained headroom. Raising is slow and backs off when a raise
 * is soon undone, so it does not oscillate. After five evaluation windows at the floor below ~14 fps (or `giveUpFps`) it gives up.
 */
export class RenderScaleController {
  ratio: number;
  gaveUp = false;
  readonly min: number;
  readonly max: number;
  private windowMs: number;
  private neverGiveUp: boolean;
  private giveUpFps: number;
  private count = 0;
  private slow = 0;
  private total = 0;
  private settle = 0;
  private goodWindows = 0;
  private upHold = 3;
  private windowsSinceUp = Infinity;
  private hopelessWindows = 0;

  constructor({ min, start, max, windowMs = 1000, neverGiveUp = false, giveUpFps = 14 }: RenderScaleOptions) {
    this.min = min;
    this.max = max;
    this.ratio = start;
    this.windowMs = windowMs;
    this.neverGiveUp = neverGiveUp;
    this.giveUpFps = giveUpFps;
  }

  /** Forget the current window (after a resize, a pause, a hidden tab or a frame-rate change). */
  reset(settleFrames = 4) {
    this.count = this.slow = this.total = 0;
    this.settle = settleFrames;
  }

  /** Returns true when the ratio changed. */
  sample(intervalMs: number, targetMs: number): boolean {
    if (this.gaveUp) return false;
    if (!(intervalMs > 0)) return false;
    // Clamp long frames so a single GC or main-thread hitch weighs like any other slow frame.
    intervalMs = Math.min(intervalMs, 250);
    if (this.settle > 0) {
      this.settle--;
      return false;
    }
    this.count++;
    this.total += intervalMs;
    if (intervalMs > targetMs * 1.4) this.slow++;
    if (this.total < this.windowMs || this.count < 4) return false;

    const slowShare = this.slow / this.count;
    const average = this.total / this.count;
    this.windowsSinceUp++;
    this.reset(0);

    if (this.ratio <= this.min + 1e-6 && average > 1000 / this.giveUpFps) {
      if (++this.hopelessWindows >= 5 && !this.neverGiveUp) this.gaveUp = true;
    } else this.hopelessWindows = 0;

    if (slowShare > 0.25) {
      this.goodWindows = 0;
      // A raise that is undone within a few seconds makes the next raise wait twice as long.
      if (this.windowsSinceUp <= 3) this.upHold = Math.min(this.upHold * 2, 48);
      const factor = average > targetMs * 2 ? 0.7 : 0.85;
      return this.set(this.ratio * factor);
    }
    if (slowShare <= 0.02) {
      if (++this.goodWindows >= this.upHold) {
        this.goodWindows = 0;
        const changed = this.set(this.ratio / 0.85);
        if (changed) this.windowsSinceUp = 0;
        return changed;
      }
    } else this.goodWindows = 0;
    return false;
  }

  private set(next: number): boolean {
    const clamped = Math.max(this.min, Math.min(this.max, Math.round(next * 20) / 20));
    const value = next >= this.max ? this.max : next <= this.min ? this.min : clamped;
    if (Math.abs(value - this.ratio) < 1e-6) return false;
    this.ratio = value;
    this.reset(6);
    return true;
  }
}
