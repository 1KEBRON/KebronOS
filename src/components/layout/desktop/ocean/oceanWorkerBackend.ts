import type { HoverCamera, OceanBackend, OceanEngine } from "./oceanBackends";

type Options = {
  container: HTMLElement;
  signal?: AbortSignal;
  pixelRatio: number;
  compact: boolean;
  onLost: () => void;
  onRestored: () => void;
};

/** Only one frame may be in flight: input never queues obsolete camera frames. */
export function createOceanWorkerBackend(engine: OceanEngine, options: Options): Promise<OceanBackend> {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0";
  const worker = new Worker(new URL("./ocean.worker.js", import.meta.url), { type: "module" });
  options.container.appendChild(canvas);
  let disposed = false;
  let abort: (() => void) | undefined;
  let inFlight = false;
  let completed = false;
  let pausedCamera: HoverCamera | undefined;
  let interval: number | undefined;
  let failure: Error | undefined;
  let elapsed = 0;
  let time = 0;
  let floor = 0;
  let buffer = "";
  let width = options.container.clientWidth;
  let height = options.container.clientHeight;
  let ratio = options.pixelRatio;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (abort) options.signal?.removeEventListener("abort", abort);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    canvas.remove();
  };
  return new Promise((resolve, reject) => {
    let initialized = false;
    abort = () => { dispose(); reject(new DOMException("Ocean initialization cancelled", "AbortError")); };
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener("abort", abort, { once: true });
    const fail = (message: string) => {
      failure = new Error(message);
      if (!initialized) { dispose(); reject(failure); }
    };
    worker.onerror = (event) => fail(event.message || "Ocean worker failed");
    worker.onmessage = ({ data }) => {
      if (disposed) return;
      if (data.type === "error") { fail(data.message); return; }
      if (data.type === "lost") { options.onLost(); return; }
      if (data.type === "restored") { options.onRestored(); return; }
      if (data.type === "frame") {
        inFlight = false;
        completed = true;
        interval = data.interval;
        time = data.time;
        floor = data.floor;
        buffer = data.buffer;
        return;
      }
      if (data.type !== "ready") return;
      initialized = true;
      resolve({
        engine, canvas, mode: data.mode,
        time: () => time,
        floor: () => floor,
        draw(dt, paused, camera) {
          if (failure) throw failure;
          elapsed += dt;
          const unchangedPausedFrame = paused && completed && pausedCamera &&
            camera.x === pausedCamera.x && camera.y === pausedCamera.y && camera.z === pausedCamera.z &&
            camera.yaw === pausedCamera.yaw && camera.pitch === pausedCamera.pitch;
          if (!inFlight && !disposed && !unchangedPausedFrame) {
            pausedCamera = paused ? { ...camera } : undefined;
            inFlight = true;
            worker.postMessage({ type: "draw", dt: elapsed, paused, camera });
            elapsed = 0;
          }
          if (unchangedPausedFrame) elapsed = 0;
          const result = completed;
          completed = false;
          return result;
        },
        frameInterval() { const value = interval; interval = undefined; return value; },
        resize(nextRatio = ratio) {
          const w = options.container.clientWidth, h = options.container.clientHeight;
          if (w === width && h === height && nextRatio === ratio) return false;
          width = w; height = h; ratio = nextRatio;
          pausedCamera = undefined;
          worker.postMessage({ type: "resize", width, height, ratio });
          return true;
        },
        bufferSize: () => buffer,
        dispose,
      });
    };
    try {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: "init", engine, canvas: offscreen, width, height, ratio, compact: options.compact }, [offscreen]);
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
