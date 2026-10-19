import { expect, test } from "bun:test";

// Isolate the page-lifetime cache from other tests that hydrate the files store.
test("seed consumers share a fresh request and can retry a failed page load", async () => {
  const child = Bun.spawn([process.execPath, "--eval", `
    let calls = 0;
    const source = '{ "files": [], "directories": [] }\\n';
    globalThis.fetch = async () => {
      calls++;
      return calls === 1
        ? new Response('Unavailable', { status: 503 })
        : new Response(source);
    };
    const { loadDefaultFilesystemText } = await import('./src/utils/defaultFilesystem.ts');
    let rejected = false;
    try { await loadDefaultFilesystemText(); } catch { rejected = true; }
    const first = loadDefaultFilesystemText();
    const second = loadDefaultFilesystemText();
    const results = await Promise.all([first, second]);
    const cached = await loadDefaultFilesystemText();
    console.log(JSON.stringify({ rejected, shared: first === second, calls,
      unchanged: results.every(text => text === source) && cached === source }));
  `], { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  expect(JSON.parse(output)).toEqual({
    rejected: true,
    shared: true,
    calls: 2,
    unchanged: true,
  });
});
