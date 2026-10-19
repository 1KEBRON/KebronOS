import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTouchViewportStore, getTouchViewportStore } from "@/hooks/useTouchViewport";

describe("cached touch viewport", () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const listeners = new Set<() => void>();
  let width = 1024, reads = 0, touch = 0;
  beforeEach(() => {
    width = 1024; reads = 0; touch = 0; listeners.clear();
    const window = {
      get innerWidth() { reads++; return width; },
      addEventListener(_type: string, fn: () => void) { listeners.add(fn); },
      removeEventListener(_type: string, fn: () => void) { listeners.delete(fn); },
    };
    for (const [key, value] of Object.entries({ window, navigator: { get maxTouchPoints() { return touch; } } })) {
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true });
    }
  });
  afterEach(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  test("repeated React snapshots do not force viewport layout reads", () => {
    const store = createTouchViewportStore(768, false);
    const stop = store.subscribe(() => {});
    const initialReads = reads;
    for (let i = 0; i < 100; i++) expect(store.getSnapshot()).toBe(false);
    expect(reads).toBe(initialReads);
    stop(); expect(listeners.size).toBe(0);
  });
  test("preserves the mobile OR and phone AND rules at the boundary", () => {
    const mobile = createTouchViewportStore(768, false);
    const phone = createTouchViewportStore(640, true);
    const stopMobile = mobile.subscribe(() => {}), stopPhone = phone.subscribe(() => {});
    const resize = () => listeners.forEach(fn => fn());
    width = 639; resize();
    expect(mobile.getSnapshot()).toBe(true); expect(phone.getSnapshot()).toBe(false);
    touch = 1; resize();
    expect(phone.getSnapshot()).toBe(true);
    width = 640; resize();
    expect(phone.getSnapshot()).toBe(false);
    width = 1024; resize();
    expect(mobile.getSnapshot()).toBe(true);
    stopMobile(); stopPhone();
  });
  test("catches resize between render and subscription without redundant notifications", () => {
    const store = createTouchViewportStore(768, false);
    width = 500; let notifications = 0;
    const stop = store.subscribe(() => { notifications++; });
    expect(store.getSnapshot()).toBe(true); expect(notifications).toBe(1);
    listeners.forEach(fn => fn()); expect(notifications).toBe(1);
    stop();
  });
  test("new consumers share one cached viewport and one resize subscription", () => {
    const first = getTouchViewportStore(768, false);
    const stopFirst = first.subscribe(() => {});
    const initialReads = reads;
    const second = getTouchViewportStore(768, false);
    let notifications = 0;
    const stopSecond = second.subscribe(() => notifications++);
    expect(second).toBe(first);
    expect(reads).toBe(initialReads);
    expect(listeners.size).toBe(1);
    width = 500;
    listeners.forEach(fn => fn());
    expect(reads).toBe(initialReads + 1);
    expect(notifications).toBe(1);
    stopFirst();
    expect(listeners.size).toBe(1);
    stopSecond();
    expect(listeners.size).toBe(0);
    width = 1024;
    const stopAgain = first.subscribe(() => notifications++);
    expect(first.getSnapshot()).toBe(false);
    stopAgain();
  });

});
