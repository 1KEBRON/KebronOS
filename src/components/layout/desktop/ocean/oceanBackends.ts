// The two live oceans behind one interface, so the wallpaper layer drives either with the same camera and frame
// loop: web-ocean (WebGPU: FFT sea, sunset sky with clouds and sun glitter) where the browser has WebGPU, and
// NAGI's three.js ocean (WebGL 2, photo sky) everywhere else.

export type OceanEngine = "webgpu" | "webgl";

/** Hover camera in the layer's convention: yaw 0 looks along -Z, positive yaw turns towards -X; pitch up is positive. */
export type HoverCamera = { x: number; y: number; z: number; yaw: number; pitch: number };

export type OceanBackend = {
  engine: OceanEngine;
  canvas: HTMLCanvasElement;
  /** Short label for the ?fps readout. */
  mode: string;
  /** Seconds of simulated sea (drives the camera bob). */
  time(): number;
  /** Lowest camera height that stays clear of the water right now. */
  floor(): number;
  draw(dt: number, paused: boolean, camera: HoverCamera): void;
  resize(pixelRatio?: number): boolean;
  bufferSize(): string;
  dispose(): void;
};

type Lost = { onLost: () => void; onRestored: () => void };

export async function createWebGPUBackend(
  options: { container: HTMLElement; pixelRatio: number; compact: boolean } & Lost
): Promise<OceanBackend> {
  const { createWebOcean } = await import("./vendor/web-ocean/web-ocean.js");
  const ocean = await createWebOcean({
    container: options.container,
    pixelRatio: options.pixelRatio,
    // 4× MSAA costs too much fill rate on phones; the adaptive pixel ratio does the anti-aliasing there.
    msaa: options.compact ? 1 : 4,
    // The README opens on the left of wide screens; set the sun right of centre there so it stays in view.
    // Portrait screens are too narrow for that and keep it straight ahead.
    params: { sunAzim: options.container.clientWidth > options.container.clientHeight ? 18 : 4 },
    // WebGPU has no context restore: a lost device is rebuilt from scratch by the layer.
    onLost: () => {
      options.onLost();
      options.onRestored();
    },
  });
  return {
    engine: "webgpu",
    canvas: ocean.canvas,
    mode: "web-ocean",
    time: () => ocean.time,
    floor: () => ocean.waterHeight + 0.9,
    draw(dt, paused, camera) {
      const c = ocean.camera;
      c.x = camera.x;
      c.y = camera.y;
      c.z = camera.z;
      c.yaw = -camera.yaw;
      c.pitch = camera.pitch;
      ocean.render(paused ? 0 : dt);
    },
    resize: (ratio) => ocean.resize(ratio),
    bufferSize: () => ocean.bufferSize.join("×"),
    dispose: () => ocean.dispose(),
  };
}

export async function createWebGLBackend(
  options: { container: HTMLElement; pixelRatio: number; compact: boolean } & Lost
): Promise<{ backend: OceanBackend; ready: Promise<unknown> }> {
  const { createSea, Vector3 } = await import("./sea.js");
  const sea = createSea({
    container: options.container,
    quality: options.compact ? "light" : "balanced",
    pixelRatio: options.pixelRatio,
    // The sky photo is web-ocean's dawn, baked by scripts/bake-dawn-sky.ts with the sun 2.6° up.
    sunDegrees: 2.6,
  });
  const canvas = sea.renderer.domElement;
  const look = new Vector3();
  const onLost = (e: Event) => {
    e.preventDefault();
    options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", options.onRestored);
  const backend: OceanBackend = {
    engine: "webgl",
    canvas,
    get mode() {
      return sea.mode;
    },
    time: () => (sea.uniforms.uTime.value as number) || 0,
    floor: () => 0,
    draw(dt, paused, camera) {
      sea.camera.position.set(camera.x, camera.y, camera.z);
      look.set(
        camera.x - Math.sin(camera.yaw) * Math.cos(camera.pitch) * 100,
        camera.y + Math.sin(camera.pitch) * 100,
        camera.z - Math.cos(camera.yaw) * Math.cos(camera.pitch) * 100
      );
      sea.camera.lookAt(look);
      sea.update(dt, { paused });
      sea.render();
    },
    resize: (ratio) => sea.resize(ratio),
    bufferSize: () => {
      const gl = sea.renderer.getContext();
      return gl.drawingBufferWidth + "×" + gl.drawingBufferHeight;
    },
    dispose() {
      // Remove these before dispose(): it forces a context loss of its own.
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", options.onRestored);
      sea.dispose();
    },
  };
  return { backend, ready: sea.ready };
}
