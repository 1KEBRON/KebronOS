import { createOceanSound, type OceanSound } from "./sound.js";

let shared: OceanSound | null | undefined;

/** One ambient sound engine per page, created on first request (after a visitor gesture). */
export function getOceanSound(): OceanSound | null {
  if (shared === undefined) shared = createOceanSound();
  return shared;
}

/** The engine if it already exists; never creates one. */
export function peekOceanSound(): OceanSound | null | undefined {
  return shared;
}
