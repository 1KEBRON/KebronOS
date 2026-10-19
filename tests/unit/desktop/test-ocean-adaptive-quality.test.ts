import { describe, expect, test } from "bun:test";
import {
  ACTIVE_FPS,
  COVERED_FPS,
  IDLE_FPS,
  RenderScaleController,
  pixelRatioBounds,
  targetFps,
} from "@/components/layout/desktop/ocean/adaptiveQuality";

/** Feed `seconds` worth of frames at a fixed interval against a target rate. */
function run(c: RenderScaleController, intervalMs: number, targetMs: number, seconds: number) {
  let changes = 0;
  for (let t = 0; t < seconds * 1000; t += intervalMs) if (c.sample(intervalMs, targetMs)) changes++;
  return changes;
}

describe("pixelRatioBounds", () => {
  test("phones cap at 1.25 and start at 1 even on DPR 3", () => {
    expect(pixelRatioBounds(3, true)).toEqual({ min: 0.5, start: 1, max: 1.25 });
  });
  test("desktops cap at 1.5 and start at 1.25", () => {
    expect(pixelRatioBounds(2, false)).toEqual({ min: 0.6, start: 1.25, max: 1.5 });
  });
  test("never exceeds the device ratio", () => {
    const b = pixelRatioBounds(1, false);
    expect(b.max).toBe(1);
    expect(b.start).toBe(1);
    expect(b.min).toBeLessThanOrEqual(b.start);
  });
  test("bad input falls back to 1", () => {
    expect(pixelRatioBounds(0, true).max).toBe(1);
  });
});

describe("targetFps", () => {
  test("full rate when interacting or immersive", () => {
    expect(targetFps({ immersive: true, interacting: false, covered: true })).toBe(ACTIVE_FPS);
    expect(targetFps({ immersive: false, interacting: true, covered: false })).toBe(ACTIVE_FPS);
  });
  test("lower as a backdrop, lowest behind windows", () => {
    expect(targetFps({ immersive: false, interacting: false, covered: false })).toBe(IDLE_FPS);
    expect(targetFps({ immersive: false, interacting: false, covered: true })).toBe(COVERED_FPS);
  });
});

describe("RenderScaleController", () => {
  const bounds = { min: 0.5, start: 1, max: 1.25 };

  test("holds steady when frames meet the target", () => {
    const c = new RenderScaleController({ ...bounds, max: 1 });
    expect(run(c, 16.7, 16.7, 10)).toBe(0);
    expect(c.ratio).toBe(1);
  });

  test("scales down when frames are consistently late", () => {
    const c = new RenderScaleController(bounds);
    run(c, 33.3, 16.7, 1.5);
    expect(c.ratio).toBeLessThan(1);
  });

  test("steps down harder when frames take over twice the budget", () => {
    const gentle = new RenderScaleController(bounds);
    const hard = new RenderScaleController(bounds);
    run(gentle, 25, 16.7, 1.3);
    run(hard, 50, 16.7, 1.3);
    expect(hard.ratio).toBeLessThan(gentle.ratio);
  });

  test("never goes below the floor", () => {
    const c = new RenderScaleController({ ...bounds, neverGiveUp: true });
    run(c, 60, 16.7, 30);
    expect(c.ratio).toBe(0.5);
    expect(c.gaveUp).toBe(false);
  });

  test("sustained missed vsync lowers active quality before interaction becomes choppy", () => {
    const active = new RenderScaleController({ ...bounds, max: 1 });
    const backdrop = new RenderScaleController({ ...bounds, max: 1 });
    for (let i = 0; i < 120; i++) {
      const late = i % 8 === 0;
      active.sample(late ? 1000 / 30 : 1000 / 60, 1000 / 60);
      backdrop.sample(late ? 1000 / 15 : 1000 / 30, 1000 / 30);
    }
    expect(active.ratio).toBeLessThan(1);
    expect(backdrop.ratio).toBe(1);
  });

  test("isolated hitches and huge gaps do not lower the ratio", () => {
    const c = new RenderScaleController(bounds);
    for (let i = 0; i < 300; i++) c.sample(i % 30 === 0 ? 40 : 16.7, 16.7);
    c.sample(5000, 16.7);
    expect(c.ratio).toBeGreaterThanOrEqual(1);
  });

  test("scales back up only after sustained headroom, never above the ceiling", () => {
    const c = new RenderScaleController(bounds);
    run(c, 33.3, 16.7, 1.2);
    const lowered = c.ratio;
    expect(lowered).toBeLessThan(1);
    run(c, 16.7, 16.7, 1.5);
    expect(c.ratio).toBe(lowered); // one good second is not enough
    run(c, 16.7, 16.7, 60);
    expect(c.ratio).toBe(1.25);
  });

  test("backs off raising after a raise is quickly undone (hysteresis)", () => {
    const c = new RenderScaleController(bounds);
    run(c, 33.3, 16.7, 1.2); // down to 0.85
    let raises = 0;
    // A device that copes at <=0.85 but not above: each raise is followed by slow frames.
    for (let t = 0; t < 60; t++) {
      const before = c.ratio;
      run(c, c.ratio > 0.86 ? 33.3 : 16.7, 16.7, 1);
      if (c.ratio > before) raises++;
    }
    // Hold doubles 3 → 6 → 12 → 24 → 48 windows, so a minute brings only a handful of attempts.
    expect(raises).toBeLessThanOrEqual(4);
    expect(c.ratio).toBeLessThanOrEqual(1);
  });

  test("gives up after several seconds at the floor below ~14 fps", () => {
    const c = new RenderScaleController(bounds);
    run(c, 120, 33.3, 30);
    expect(c.ratio).toBe(0.5);
    expect(c.gaveUp).toBe(true);
    expect(c.sample(120, 33.3)).toBe(false);
  });

  test("a higher giveUpFps gives up on frame rates the default tolerates", () => {
    const strict = new RenderScaleController({ ...bounds, giveUpFps: 24 });
    const lenient = new RenderScaleController(bounds);
    run(strict, 50, 33.3, 30);
    run(lenient, 50, 33.3, 30);
    expect(strict.gaveUp).toBe(true);
    expect(lenient.gaveUp).toBe(false);
  });

  test("does not give up when merely below target at the floor", () => {
    const c = new RenderScaleController(bounds);
    run(c, 40, 16.7, 30);
    expect(c.ratio).toBe(0.5);
    expect(c.gaveUp).toBe(false);
  });

  test("reset discards the partial window and settles", () => {
    const c = new RenderScaleController(bounds);
    for (let i = 0; i < 20; i++) c.sample(33.3, 16.7);
    c.reset();
    for (let i = 0; i < 20; i++) c.sample(16.7, 16.7);
    expect(c.ratio).toBe(1);
  });
});
