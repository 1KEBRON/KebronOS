export type WebOceanParams = {
  windSpeed: number;
  windDir: number;
  fetchKm: number;
  swellHs: number;
  swellDir: number;
  swellLength: number;
  swellSpread: number;
  choppy: number;
  turbidity: number;
  foam: number;
  sunElev: number;
  sunAzim: number;
  exposure: number;
  haze: number;
  clouds: number;
  veil: number;
  bloom: number;
};

export const DEFAULT_PARAMS: WebOceanParams;

export type WebOcean = {
  canvas: HTMLCanvasElement;
  /** yaw 0 looks along -Z, positive yaw turns towards +X; positive pitch looks up (radians). */
  camera: { x: number; y: number; z: number; yaw: number; pitch: number; fovY: number };
  params: WebOceanParams;
  readonly time: number;
  readonly waterHeight: number;
  readonly pixelRatio: number;
  readonly bufferSize: [number, number];
  /** Advances the sea by dt seconds and draws one frame. */
  render(dt: number): void;
  /** Match the drawing buffer to the container (and optionally a new pixel ratio); returns whether it changed. */
  resize(pixelRatio?: number): boolean;
  /** Linear HDR radiance of the last frame before exposure and tone mapping (RGBA float32, rows top-down). */
  readHDR(): Promise<{ width: number; height: number; data: Float32Array }>;
  dispose(): void;
};

export function webGPUAvailable(): boolean;

export function createWebOcean(options: {
  container: HTMLElement;
  pixelRatio?: number;
  msaa?: 1 | 4;
  params?: Partial<WebOceanParams>;
  onLost?: (reason: string) => void;
}): Promise<WebOcean>;
