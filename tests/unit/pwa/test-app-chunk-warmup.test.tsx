import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import "@/stores/useAppStore";
import { createLazyComponent, prefetchAppChunk, prefetchLikelyAppChunks } from "@/config/lazyAppComponent";
import { initializeI18nForFirstPaint, ensureCurrentLanguageResources } from "@/lib/i18n";

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test("a warmed app renders its content without suspending or importing twice", async () => {
  await initializeI18nForFirstPaint();
  await ensureCurrentLanguageResources();
  let imports = 0;
  const App = createLazyComponent(async () => {
    imports++;
    return { default: () => <input aria-label="Ready" /> };
  }, "warmup-test-ready");
  prefetchAppChunk("warmup-test-ready");
  prefetchAppChunk("warmup-test-ready");
  await settle();
  const html = renderToString(<App isWindowOpen onClose={() => {}} />);
  expect(html).toContain('aria-label="Ready"');
  expect(html).not.toContain("Switched to client rendering");
  expect(imports).toBe(1);
});

test("a failed speculative warmup can be retried", async () => {
  await initializeI18nForFirstPaint();
  await ensureCurrentLanguageResources();
  let imports = 0;
  const App = createLazyComponent(async () => {
    if (++imports === 1) throw new Error("Temporary download failure");
    return { default: () => <span>Recovered</span> };
  }, "warmup-test-retry");
  prefetchAppChunk("warmup-test-retry");
  await settle();
  prefetchAppChunk("warmup-test-retry");
  await settle();
  expect(renderToString(<App isWindowOpen onClose={() => {}} />)).toContain("Recovered");
  expect(imports).toBe(2);
});

test("default-app warming lets the first app finish before fetching the next", async () => {
  await initializeI18nForFirstPaint();
  await ensureCurrentLanguageResources();
  const calls: string[] = [];
  let release!: () => void;
  const firstDownload = new Promise<void>(resolve => { release = resolve; });
  createLazyComponent(async () => {
    calls.push("first");
    await firstDownload;
    return { default: () => null };
  }, "warmup-test-first");
  createLazyComponent(async () => {
    calls.push("second");
    return { default: () => null };
  }, "warmup-test-second");
  prefetchLikelyAppChunks(["warmup-test-first", "warmup-test-first", "warmup-test-second"]);
  for (let i = 0; calls.length < 1 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
  expect(calls).toEqual(["first"]);
  release();
  for (let i = 0; calls.length < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
  expect(calls).toEqual(["first", "second"]);
});
