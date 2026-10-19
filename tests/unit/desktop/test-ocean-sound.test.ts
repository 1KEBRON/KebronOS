import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createOceanSound } from "@/components/layout/desktop/ocean/sound.js";

const parameter = () => ({
  value: 0,
  cancelScheduledValues() {},
  setTargetAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
});

class AudioNodeStub {
  gain = parameter();
  frequency = parameter();
  pan = parameter();
  connect() { return this; }
  start() {}
}

class AudioContextStub {
  sampleRate = 1;
  currentTime = 0;
  destination = {};
  suspends = 0;
  resumes = 0;
  resumeImpl = () => Promise.resolve();
  suspendImpl = () => Promise.resolve();
  createGain() { return new AudioNodeStub(); }
  createBuffer() { return { getChannelData: () => new Float32Array(6) }; }
  createBufferSource() { return new AudioNodeStub(); }
  resume() { this.resumes++; return this.resumeImpl(); }
  suspend() { this.suspends++; return this.suspendImpl(); }
}

describe("ocean sound idle lifecycle", () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0;
  let context: AudioContextStub;
  let originalWarn: typeof console.warn;
  let warnings: unknown[][];

  beforeEach(() => {
    context = new AudioContextStub();
    nextTimer = 0;
    timers.clear();
    warnings = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    const replacements = {
      window: { AudioContext: class { constructor() { return context; } } },
      BiquadFilterNode: AudioNodeStub,
      GainNode: AudioNodeStub,
      StereoPannerNode: AudioNodeStub,
      setTimeout: (callback: () => void, delay: number) => {
        timers.set(++nextTimer, { callback, delay });
        return nextTimer;
      },
      clearTimeout: (id: number) => { timers.delete(id); },
    };
    for (const [key, value] of Object.entries(replacements)) {
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
  });

  afterEach(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    originals.clear();
    timers.clear();
    console.warn = originalWarn;
  });

  const fadeCallback = () => {
    const timer = [...timers.values()].find((entry) => entry.delay === 3000);
    expect(timer).toBeDefined();
    return timer!.callback;
  };

  test("suspends after the fade and resumes when enabled again", async () => {
    const sound = createOceanSound()!;
    await sound.enable();
    expect(sound.on).toBe(true);
    sound.disable();
    expect(sound.on).toBe(false);
    expect(context.suspends).toBe(0);
    expect(timers.size).toBe(1);
    fadeCallback()();
    expect(context.suspends).toBe(1);
    await sound.enable();
    expect(context.resumes).toBe(2);
    expect(sound.on).toBe(true);
  });

  test("reenabling cancels a pending suspension, including a stale callback", async () => {
    const sound = createOceanSound()!;
    await sound.enable();
    sound.disable();
    const staleFade = fadeCallback();
    await sound.enable();
    expect([...timers.values()].some((entry) => entry.delay === 3000)).toBe(false);
    staleFade();
    expect(context.suspends).toBe(0);
    expect(sound.on).toBe(true);
  });

  test("disable wins over a pending resume", async () => {
    let resolveResume!: () => void;
    context.resumeImpl = () => new Promise<void>((resolve) => { resolveResume = resolve; });
    const sound = createOceanSound()!;
    const pending = sound.enable();
    sound.disable();
    resolveResume();
    await pending;
    expect(sound.on).toBe(false);
    expect(timers.size).toBe(1);
    fadeCallback()();
    expect(context.suspends).toBe(1);
  });

  test("a rejected resume leaves sound off and does not schedule waves", async () => {
    context.resumeImpl = () => Promise.reject(new Error("blocked"));
    const sound = createOceanSound()!;
    await sound.enable();
    expect(sound.on).toBe(false);
    expect(timers.size).toBe(0);
    expect(warnings.length).toBe(1);
  });

  test("a rejected suspension is handled", async () => {
    context.suspendImpl = () => Promise.reject(new Error("closed"));
    const sound = createOceanSound()!;
    await sound.enable();
    sound.disable();
    fadeCallback()();
    await Promise.resolve();
    expect(sound.on).toBe(false);
    expect(warnings.length).toBe(1);
  });
});
