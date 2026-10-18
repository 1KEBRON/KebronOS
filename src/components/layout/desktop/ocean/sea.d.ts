export { Vector3 } from "three";
import type { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
// Runtime objects come from the "three-nagi" alias (three@0.180.0, the version NAGI targets); the shapes match.

export type Sea = {
  renderer: WebGLRenderer;
  scene: Scene;
  underScene: Scene;
  camera: PerspectiveCamera;
  uniforms: Record<string, { value: unknown }>;
  ready: Promise<unknown>;
  update(dt: number, options?: { paused?: boolean }): void;
  render(): void;
  /** Match the drawing buffer to the container (and optionally a new pixel ratio); returns whether it changed. */
  resize(pixelRatio?: number): boolean;
  readonly pixelRatio: number;
  dispose(): void;
  sunDirection(): Vector3;
  readonly mode: "spectral" | "capillary" | "analytic";
};

export function createSea(options: {
  container: HTMLElement;
  quality?: "balanced" | "light";
  /** Initial canvas pixel ratio (already capped by the caller). */
  pixelRatio?: number;
  sunDegrees?: number;
  wave?: number;
  wind?: number;
}): Sea;
