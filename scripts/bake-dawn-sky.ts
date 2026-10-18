// Bakes web-ocean's dawn sky into NAGI's photo-sky format (public/ocean/sky-dawn-{base,gain}[-2048].jpg), so the
// WebGL ocean on phones shows the same sunrise as the WebGPU one on desktops.
//
//   bun --bun node_modules/.bin/vite --port 5188     (dev server, in another terminal)
//   bun scripts/bake-dawn-sky.ts [--url http://localhost:5188/scripts/bake-dawn-sky.html] [--scale 0.75] [--reuse]
//
// It drives a throwaway headless Chrome (WebGPU) over the DevTools protocol, reads the five upper HDR cube faces
// rendered by scripts/bake-dawn-sky.html, resamples them into NAGI's equirectangular frame and encodes them with
// NAGI's SDR + gain decoder (vendor/nagi/photo-sky.js). --reuse skips Chrome and re-encodes the cached faces, for
// tuning --scale. It prints the constants photo-sky.js needs for the new image.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const URL = arg("url", "http://localhost:5188/scripts/bake-dawn-sky.html");
const SCALE = Number(arg("scale", "0.75"));
const CHROME = arg("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const CACHE = join(tmpdir(), "kebron-dawn-sky-faces");
const OUT = join(import.meta.dir, "..", "public", "ocean");

type Face = { name: string; yaw: number; pitch: number; size: number; rgb: Float32Array };
type Bake = { sunElev: number; sunAzim: number; faces: Face[] };

async function bakeFaces(): Promise<Bake> {
  const port = 9334;
  const profile = join(tmpdir(), "kebron-dawn-sky-chrome");
  const chrome = Bun.spawn(
    [CHROME, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      "--enable-unsafe-webgpu", "--enable-gpu", "--ignore-gpu-blocklist", "about:blank"],
    { stdout: "ignore", stderr: "ignore" },
  );
  try {
    let ws: WebSocket | undefined;
    for (let i = 0; i < 100 && !ws; i++) {
      await Bun.sleep(200);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        const page = list.find((t) => t.type === "page");
        if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
      } catch {
        /* not up yet */
      }
    }
    if (!ws) throw new Error("headless Chrome did not start");
    await new Promise((r) => ws!.addEventListener("open", r, { once: true }));
    type CdpReply = { id?: number; result?: { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string } } } };
    let id = 0;
    const pending = new Map<number, (v: CdpReply) => void>();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)!(m);
        pending.delete(m.id);
      }
    });
    const send = (method: string, params: object = {}) =>
      new Promise<CdpReply>((r) => {
        const i = ++id;
        pending.set(i, r);
        ws!.send(JSON.stringify({ id: i, method, params }));
      });
    const evaluate = async (expression: string) => {
      const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? "evaluate failed");
      return res.result?.result?.value;
    };
    await send("Page.enable");
    await send("Page.navigate", { url: URL });
    for (let i = 0; i < 100; i++) {
      await Bun.sleep(200);
      if ((await evaluate("typeof window.bake")) === "function") break;
    }
    console.log("baking cube faces…");
    const meta = (await evaluate("window.bake()")) as Omit<Bake, "faces"> & { faces: Omit<Face, "rgb">[] };
    const faces: Face[] = [];
    for (const [index, face] of meta.faces.entries()) {
      const total = face.size * face.size * 3;
      const rgb = new Float32Array(total);
      const step = 1 << 20;
      for (let start = 0; start < total; start += step) {
        const count = Math.min(step, total - start);
        const b64 = (await evaluate(`window.faceChunk(${index}, ${start}, ${count})`)) as string;
        rgb.set(new Float32Array(Buffer.from(b64, "base64").buffer.slice(0)), start);
      }
      faces.push({ ...face, rgb });
      console.log(`  ${face.name} ${face.size}²`);
    }
    return { sunElev: meta.sunElev, sunAzim: meta.sunAzim, faces };
  } finally {
    chrome.kill();
  }
}

function saveCache(bake: Bake) {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, "meta.json"), JSON.stringify({ ...bake, faces: bake.faces.map(({ rgb: _, ...f }) => f) }));
  for (const f of bake.faces) writeFileSync(join(CACHE, `${f.name}.f32`), Buffer.from(f.rgb.buffer));
}

function loadCache(): Bake {
  const meta = JSON.parse(readFileSync(join(CACHE, "meta.json"), "utf8"));
  const faces = meta.faces.map((f: Omit<Face, "rgb">) => {
    const b = readFileSync(join(CACHE, `${f.name}.f32`));
    return { ...f, rgb: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) };
  });
  return { ...meta, faces };
}

const D2R = Math.PI / 180;
// photo-sky.js turns world directions into image directions with q.xz = mat2(c, s, -s, c) * w.xz.
const ROTATION = 3.093747;
const cr = Math.cos(ROTATION), sr = Math.sin(ROTATION);
const toImage = (wx: number, wz: number) => [cr * wx - sr * wz, sr * wx + cr * wz];
const toWorld = (qx: number, qz: number) => [cr * qx + sr * qz, -sr * qx + cr * qz];

function faceBasis(face: Face) {
  const y = face.yaw * D2R, p = face.pitch * D2R;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  const f = [cp * sy, sp, -cp * cy];
  const r = [cy, 0, sy];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}

/** Bilinear HDR radiance of the cube in world direction d (upper hemisphere). */
function makeSampler(faces: Face[]) {
  const bases = faces.map(faceBasis);
  const out = [0, 0, 0];
  return (dx: number, dy: number, dz: number) => {
    let best = 0, bestT = -Infinity;
    for (let i = 0; i < bases.length; i++) {
      const { f } = bases[i];
      const t = dx * f[0] + dy * f[1] + dz * f[2];
      if (t > bestT) { bestT = t; best = i; }
    }
    const { f, r, u } = bases[best];
    const face = faces[best];
    const S = face.size;
    const t = dx * f[0] + dy * f[1] + dz * f[2];
    const nx = (dx * r[0] + dy * r[1] + dz * r[2]) / t;
    const ny = (dx * u[0] + dy * u[1] + dz * u[2]) / t;
    const px = Math.min(S - 1.001, Math.max(0, ((nx + 1) / 2) * S - 0.5));
    const py = Math.min(S - 1.001, Math.max(0, ((1 - ny) / 2) * S - 0.5));
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    for (let c = 0; c < 3; c++) {
      const a = face.rgb[(y0 * S + x0) * 3 + c], b = face.rgb[(y0 * S + x0 + 1) * 3 + c];
      const d = face.rgb[((y0 + 1) * S + x0) * 3 + c], e = face.rgb[((y0 + 1) * S + x0 + 1) * 3 + c];
      out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
    return out;
  };
}

// NAGI's decoder: code = (sdr + 1) * 2^(15.99 * gain * W) - 1, linear = sRGB⁻¹(code / 255) (extended above 255).
const GAIN_WEIGHT = 0.42399845327747504;
const srgbCode = (linear: number) =>
  255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055);
function encode(linear: number): [number, number] {
  const code = srgbCode(Math.max(0, linear));
  if (code <= 254.5) return [Math.round(code), 0];
  const gain = Math.min(255, Math.ceil((255 * Math.log2((code + 1) / 256)) / (15.99 * GAIN_WEIGHT)));
  const sdr = Math.round((code + 1) / Math.pow(2, (15.99 * GAIN_WEIGHT * gain) / 255) - 1);
  return [Math.min(255, Math.max(0, sdr)), gain];
}

async function writeImages(bake: Bake, width: number, suffix: string) {
  const height = width / 2;
  const sample = makeSampler(bake.faces);
  const sdr = Buffer.alloc(width * height * 3);
  const gain = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row++) {
    // Texture rows are flipped on upload (flipY), so image row 0 is the top of the sky (uv.y = 1).
    const lat = (0.5 - (row + 0.5) / height) * Math.PI;
    // NAGI mirrors the sky below the horizon; do the same so the seam is invisible.
    const qy = Math.abs(Math.sin(lat)), cl = Math.cos(lat);
    for (let col = 0; col < width; col++) {
      const lon = ((col + 0.5) / width - 0.5) * 2 * Math.PI;
      const [wx, wz] = toWorld(cl * Math.cos(lon), cl * Math.sin(lon));
      const L = sample(wx, Math.max(qy, 0.0005), wz);
      for (let c = 0; c < 3; c++) {
        const [s, g] = encode(L[c] * SCALE);
        sdr[(row * width + col) * 3 + c] = s;
        gain[(row * width + col) * 3 + c] = g;
      }
    }
  }
  const jpeg = { quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true } as const;
  await sharp(sdr, { raw: { width, height, channels: 3 } }).jpeg(jpeg).toFile(join(OUT, `sky-dawn-base${suffix}.jpg`));
  await sharp(gain, { raw: { width, height, channels: 3 } }).jpeg({ ...jpeg, quality: 95 }).toFile(join(OUT, `sky-dawn-gain${suffix}.jpg`));
  console.log(`wrote sky-dawn-base${suffix}.jpg, sky-dawn-gain${suffix}.jpg (${width}×${height})`);
}

const bake = args.includes("--reuse") && existsSync(join(CACHE, "meta.json")) ? loadCache() : await bakeFaces();
saveCache(bake);
await writeImages(bake, 4096, "");
await writeImages(bake, 2048, "-2048");

// Constants for vendor/nagi/photo-sky.js: the sun in image space, and the sky level next to it (removeSkySun
// clips anything brighter within 1.25° and NAGI draws its own sun disc instead).
const e = bake.sunElev * D2R, a = bake.sunAzim * D2R;
const sun = [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
const [qx, qz] = toImage(sun[0], sun[2]);
const sample = makeSampler(bake.faces);
const ring = [0, 0, 0];
for (let k = 0; k < 64; k++) {
  const ang = (k / 64) * 2 * Math.PI, off = 1.6 * D2R;
  const right = [Math.cos(a), 0, Math.sin(a)];
  const L = sample(
    sun[0] + right[0] * Math.cos(ang) * off,
    Math.max(sun[1] + Math.sin(ang) * off, 0.001),
    sun[2] + right[2] * Math.cos(ang) * off,
  );
  for (let c = 0; c < 3; c++) ring[c] += (L[c] * SCALE) / 64;
}
console.log(`SKY_SUN_DIRECTION = vec3(${qx}, ${sun[1]}, ${qz})`);
console.log(`SKY_SUN_BASELINE  = vec3(${ring.join(", ")})`);
console.log(`photo sun elevation (rad) = ${e}`);
