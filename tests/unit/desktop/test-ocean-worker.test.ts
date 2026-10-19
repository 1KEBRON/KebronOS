import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createOceanWorkerBackend } from "@/components/layout/desktop/ocean/oceanWorkerBackend";

class WorkerStub {
  static latest: WorkerStub;
  onmessage?: (event: { data: Record<string, unknown> }) => void;
  onerror?: (event: { message: string }) => void;
  messages: Array<Record<string, unknown>> = [];
  terminated = false;
  constructor() { WorkerStub.latest = this; }
  postMessage(message: Record<string, unknown>) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  receive(data: Record<string, unknown>) { this.onmessage?.({ data }); }
}

describe("ocean worker lifecycle", () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  let removed = false;
  const canvas = { style: { cssText: "" }, transferControlToOffscreen: () => ({}), remove: () => { removed = true; } };
  const host = { clientWidth: 1440, clientHeight: 900, appendChild() {} };
  const camera = { x: 0, y: 3.5, z: 0, yaw: 0, pitch: -0.12 };
  const start = (signal?: AbortSignal) => createOceanWorkerBackend("webgpu", {
    container: host as unknown as HTMLElement, compact: false, pixelRatio: 1.25,
    onLost() {}, onRestored() {}, signal,
  });
  beforeEach(() => {
    removed = false;
    for (const [key, value] of Object.entries({ Worker: WorkerStub, document: { createElement: () => canvas } })) {
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  });
  afterEach(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  test("does not reveal a canvas or queue stale frames before the first completed draw", async () => {
    const promise = start(); const worker = WorkerStub.latest;
    worker.receive({ type: "ready", mode: "web-ocean" });
    const backend = await promise;
    expect(backend.draw(0.016, false, camera)).toBe(false);
    backend.draw(0.016, false, { ...camera, yaw: 1 });
    expect(worker.messages.filter(m => m.type === "draw")).toHaveLength(1);
    worker.receive({ type: "frame", time: 1, floor: 0.9, interval: 33.3, buffer: "1800×1125" });
    expect(backend.draw(0.016, false, { ...camera, yaw: 2 })).toBe(true);
    expect(worker.messages.at(-1)).toMatchObject({ type: "draw", dt: 0.032, camera: { yaw: 2 } });
    expect(backend.time()).toBe(1);
    expect(backend.frameInterval?.()).toBe(33.3);
    expect(backend.frameInterval?.()).toBeUndefined();
    expect(backend.draw(0.016, false, camera)).toBe(false);
    backend.dispose();
  });
  test("reveals a completed paused frame without submitting a redundant draw", async () => {
    const promise = start(); const worker = WorkerStub.latest;
    worker.receive({ type: "ready", mode: "web-ocean" });
    const backend = await promise;
    backend.draw(0.016, true, camera);
    worker.receive({ type: "frame", time: 0, floor: 0.9, buffer: "1800×1125" });
    expect(backend.draw(0.016, true, camera)).toBe(true);
    expect(worker.messages.filter(m => m.type === "draw")).toHaveLength(1);
    backend.resize(1);
    backend.draw(0.016, true, camera);
    expect(worker.messages.filter(m => m.type === "draw")).toHaveLength(2);
    backend.dispose();
  });
  test("cancels a loading worker immediately when the wallpaper unmounts", async () => {
    const controller = new AbortController();
    const promise = start(controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("cancelled");
    expect(WorkerStub.latest.terminated).toBe(true);
    expect(removed).toBe(true);
  });
  test("rejects startup errors and releases the worker and canvas for fallback", async () => {
    const promise = start();
    WorkerStub.latest.receive({ type: "error", message: "No GPU adapter" });
    await expect(promise).rejects.toThrow("No GPU adapter");
    expect(WorkerStub.latest.terminated).toBe(true);
    expect(removed).toBe(true);
  });
  test("propagates render failure to the layer's existing still fallback", async () => {
    const promise = start(); WorkerStub.latest.receive({ type: "ready", mode: "web-ocean" });
    const backend = await promise;
    WorkerStub.latest.receive({ type: "error", message: "Device lost" });
    expect(() => backend.draw(0.016, false, camera)).toThrow("Device lost");
    backend.dispose(); backend.dispose();
    expect(removed).toBe(true);
  });
});
