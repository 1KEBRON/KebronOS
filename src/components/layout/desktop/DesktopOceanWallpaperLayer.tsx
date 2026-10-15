// Live ocean wallpaper: NAGI's ocean (MIT, see ./ocean/vendor/nagi) seen from a slowly drifting hover.
// Drag the empty desktop to look around; scroll or pinch to rise and fall. The still photo underneath is
// shown while loading, without WebGL 2, after a lost GPU context, on devices too slow for it, and whenever
// rendering fails.
//
// Frame budget: no animation frames at all while the tab is hidden, while paused (reduced motion or the
// visitor's choice) once the camera has settled, or before the sky has loaded. Otherwise 60 fps while
// someone is touching the sea or in ocean-only view, 30 fps as a backdrop and 15 fps behind windows that
// cover the whole screen. The pixel ratio adapts to measured frame times (./ocean/adaptiveQuality.ts).
// Add ?fps to the URL for a small readout; ?ocean=static forces the photo, ?ocean=live never gives up.
import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { createSea, type Sea } from "./ocean/sea.js";
import { getOceanSound, peekOceanSound } from "./ocean/oceanSoundInstance";
import { RenderScaleController, pixelRatioBounds, targetFps } from "./ocean/adaptiveQuality";
import { useOceanStore } from "@/stores/useOceanStore";

const MIN_HEIGHT = 2.5;
const MAX_HEIGHT = 60;
/** Set for the rest of the session when this device could not keep the live ocean above ~14 fps. */
const SLOW_KEY = "kebron:ocean-too-slow";
/** Mobile URL bars resize the viewport while scrolling; the canvas stretches until resizing settles. */
const RESIZE_SETTLE_MS = 150;
const COVER_CHECK_MS = 1000;
const INTERACTION_LINGER_MS = 1500;
const MAX_CONTEXT_RESTORES = 2;
/** Things on the desktop that keep their own pointer behaviour; everything else is bare sea. */
const NOT_SEA = "[data-desktop-icon],[data-desktop-item-id],[data-window-instance-id],button,a,input,textarea,select,[contenteditable]";

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True when every sample point of the viewport lands on a window, so the sea is only seen through glass. */
function viewportCovered() {
  const w = innerWidth;
  const h = innerHeight;
  for (const fx of [0.1, 0.5, 0.9])
    for (const fy of [0.15, 0.5, 0.9]) {
      const hit = document.elementFromPoint(w * fx, h * fy);
      if (!hit?.closest("[data-window-instance-id]")) return false;
    }
  return true;
}

function createReadout() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;z-index:2147483647;left:calc(6px + env(safe-area-inset-left,0px));" +
    "top:calc(30px + env(safe-area-inset-top,0px));padding:4px 6px;border-radius:6px;" +
    "background:rgba(0,0,0,.62);color:#b6f5c0;font:10.5px/1.35 ui-monospace,Menlo,monospace;" +
    "white-space:pre;pointer-events:none";
  document.body.appendChild(el);
  return el;
}

export function OceanWallpaperLayer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stillRef = useRef<HTMLDivElement>(null);
  const soundOn = useOceanStore((s) => s.soundOn);
  // Bumped when the browser restores a lost WebGL context: the renderer is rebuilt from scratch.
  const [epoch, setEpoch] = useState(0);
  const restores = useRef(0);

  useEffect(() => {
    // Create the audio engine only once the visitor asks for sound (avoids autoplay warnings).
    if (!soundOn && peekOceanSound() === undefined) return;
    const sound = getOceanSound();
    if (!sound) return;
    if (soundOn) void sound.enable();
    else sound.disable();
  }, [soundOn]);

  useEffect(() => {
    const host = hostRef.current;
    const still = stillRef.current;
    if (!host) return;
    const params = new URLSearchParams(location.search);
    const oceanParam = params.get("ocean");
    const readout = params.has("fps") ? createReadout() : null;
    const say = (text: string) => {
      if (readout) readout.textContent = `ocean: ${text}`;
    };
    // ?ocean=static allows local review and GPU troubleshooting without initializing WebGL.
    if (oceanParam === "static" || (oceanParam !== "live" && readSession(SLOW_KEY))) {
      say(oceanParam === "static" ? "still image (?ocean=static)" : "still image (too slow this session; ?ocean=live)");
      return () => readout?.remove();
    }

    const compact = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
    const bounds = pixelRatioBounds(devicePixelRatio, compact);
    const scale = new RenderScaleController({ ...bounds, neverGiveUp: oceanParam === "live" });
    let sea: Sea;
    try {
      sea = createSea({ container: host, quality: compact ? "light" : "balanced", pixelRatio: scale.ratio, sunDegrees: 30 });
    } catch (error) {
      console.info("[ocean] still image fallback:", (error as Error).message);
      say(`still image (${(error as Error).message})`);
      return () => readout?.remove();
    }
    const canvas = sea.renderer.domElement;
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 1.4s ease";

    // ---- scheduling state ----
    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    let paused = useOceanStore.getState().motionPaused ?? motionQuery.matches;
    let immersive = useOceanStore.getState().immersive;
    let covered = false;
    let ready = false;
    let shown = false;
    let lost = false;
    let failed = false;
    let released = false;
    let needsFrame = true; // the first frame compiles the shaders while the photo is still showing
    let raf = 0;
    let lastRender = 0;
    let lastFps = 0;
    let lastCoverCheck = 0;
    let lastInteraction = 0;
    let stillTimer = 0;
    let resizeTimer = 0;

    // ---- hover camera ----
    const pos = new Vector3(0, 7, 0);
    // Portrait screens look further down so the sea, not the sky, fills the space above windows.
    const startPitch = host.clientHeight > host.clientWidth ? -0.34 : -0.12;
    let yaw = 0;
    let pitch = startPitch;
    let height = 7;
    let targetYaw = 0;
    let targetPitch = startPitch;
    let targetHeight = 7;
    const look = new Vector3();
    const pointers = new Map<number, { x: number; y: number }>();
    // The drift keeps yaw ~0.002 rad behind its target; anything more is the camera easing after input.
    const settling = () =>
      pointers.size > 0 ||
      Math.abs(targetYaw - yaw) > 0.003 ||
      Math.abs(targetPitch - pitch) > 0.003 ||
      Math.abs(targetHeight - height) > 0.01;

    const shouldRun = () =>
      !released && !document.hidden && !lost && !failed && (needsFrame || settling() || (ready && !paused));

    // ---- readout stats ----
    const stats = { frames: 0, intervalMs: 0, cpuMs: 0, since: performance.now() };

    const showStill = () => {
      canvas.style.opacity = "0";
      clearTimeout(stillTimer);
      if (still) still.style.visibility = "";
    };

    const frame = (now: number) => {
      raf = 0;
      if (!shouldRun()) {
        lastRender = 0;
        return;
      }
      const interacting = settling() || now - lastInteraction < INTERACTION_LINGER_MS;
      if (now - lastCoverCheck > COVER_CHECK_MS) {
        lastCoverCheck = now;
        covered = !immersive && viewportCovered();
      }
      const fps = targetFps({ immersive, interacting, covered });
      const budget = 1000 / fps;
      // Throttle to the target rate; a few ms of slack keeps the cadence on vsync boundaries.
      if (lastRender && now - lastRender < budget - 4) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const elapsed = lastRender ? now - lastRender : 0;
      const dt = elapsed ? Math.min(elapsed / 1000, 0.05) : 1 / 60;
      if (fps !== lastFps) scale.reset();
      else if (elapsed && ready) {
        if (scale.sample(elapsed, budget)) sea.resize(scale.ratio);
        if (scale.gaveUp) {
          try {
            sessionStorage.setItem(SLOW_KEY, "1");
          } catch {
            /* private mode */
          }
          console.info("[ocean] too slow on this device; still image for this session (?ocean=live overrides)");
          say("still image (too slow; ?ocean=live overrides)");
          release();
          return;
        }
      }
      lastFps = fps;
      lastRender = now;

      const k = 1 - Math.exp(-dt * 3);
      yaw += (targetYaw - yaw) * k;
      pitch += (targetPitch - pitch) * k;
      height += (targetHeight - height) * k;
      if (!paused) {
        // Drift slowly forward and let the heading wander, so the sea feels endless.
        targetYaw += dt * 0.006;
        pos.x += -Math.sin(yaw) * dt * 1.6;
        pos.z += -Math.cos(yaw) * dt * 1.6;
      }
      const time = (sea.uniforms.uTime.value as number) || 0;
      sea.camera.position.set(pos.x, height + (paused ? 0 : Math.sin(time * 0.35) * 0.12), pos.z);
      look.set(
        pos.x - Math.sin(yaw) * Math.cos(pitch) * 100,
        sea.camera.position.y + Math.sin(pitch) * 100,
        pos.z - Math.cos(yaw) * Math.cos(pitch) * 100
      );
      sea.camera.lookAt(look);
      const cpuStart = performance.now();
      try {
        sea.update(dt, { paused });
        sea.render();
      } catch (error) {
        failed = true;
        console.warn("[ocean] render failed; still image fallback", error);
        say("still image (render failed)");
        showStill();
        return;
      }
      stats.cpuMs += performance.now() - cpuStart;
      stats.intervalMs += elapsed;
      stats.frames++;
      needsFrame = false;
      peekOceanSound()?.setScene({ height });
      if (ready && !shown) {
        shown = true;
        canvas.style.opacity = "1";
        // Once the canvas has faded in, stop compositing the photo underneath it.
        stillTimer = window.setTimeout(() => {
          if (still && canvas.style.opacity === "1") still.style.visibility = "hidden";
        }, 1600);
      }
      if (shouldRun()) raf = requestAnimationFrame(frame);
      else lastRender = 0;
    };

    const schedule = () => {
      if (!raf && shouldRun()) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastRender = 0;
    };
    const wake = () => {
      needsFrame = true;
      scale.reset();
      schedule();
    };

    void sea.ready.finally(() => {
      ready = true;
      wake();
    });

    // ---- input: one finger/mouse looks around, two fingers pinch height ----
    let pinch = 0;
    const span = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastInteraction = performance.now();
      if (pointers.size === 1) {
        targetYaw += (e.clientX - prev.x) * 0.0028;
        targetPitch = Math.max(-1.1, Math.min(0.3, targetPitch + (e.clientY - prev.y) * 0.0022));
      } else {
        const d = span();
        if (d > 8 && pinch > 8) targetHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, (targetHeight * pinch) / d));
        pinch = d;
      }
      schedule();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = span();
      if (!pointers.size) {
        removeEventListener("pointermove", onMove);
        removeEventListener("pointerup", onUp);
        removeEventListener("pointercancel", onUp);
      }
      schedule();
    };
    const onSea = (e: Event) => !(e.target as Element | null)?.closest?.(NOT_SEA);
    const onDown = (e: PointerEvent) => {
      if ((e.button !== 0 && e.pointerType === "mouse") || !onSea(e)) return;
      if (!pointers.size) {
        // Global listeners only while a drag is in progress, so ordinary pointer moves cost nothing.
        addEventListener("pointermove", onMove, { passive: true });
        addEventListener("pointerup", onUp, { passive: true });
        addEventListener("pointercancel", onUp, { passive: true });
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinch = span();
      lastInteraction = performance.now();
      schedule();
    };
    // Not passive: the wheel over the bare sea changes height instead of scrolling or zooming the page.
    const onWheel = (e: WheelEvent) => {
      if (!onSea(e)) return;
      e.preventDefault();
      targetHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, targetHeight + e.deltaY * 0.012));
      lastInteraction = performance.now();
      schedule();
    };
    // The desktop's icon grid spans the whole screen above the sea, so listen on the desktop itself (windows,
    // the menu bar and the dock live outside it) and skip anything that has its own gestures.
    const surface = host.parentElement ?? host;
    const previousTouchAction = surface.style.touchAction;
    // No browser panning or pinch-zoom on the bare desktop, so touch drags reach the camera without pointercancel.
    surface.style.touchAction = "none";
    surface.addEventListener("pointerdown", onDown, { passive: true });
    surface.addEventListener("wheel", onWheel, { passive: false });

    // ---- environment ----
    const onVisibility = () => {
      if (document.hidden) stop();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const updatePaused = () => {
      const next = useOceanStore.getState().motionPaused ?? motionQuery.matches;
      if (next === paused) return;
      paused = next;
      wake();
    };
    motionQuery.addEventListener("change", updatePaused);
    const unsubscribe = useOceanStore.subscribe((s) => {
      updatePaused();
      if (s.immersive !== immersive) {
        immersive = s.immersive;
        lastCoverCheck = 0;
        schedule();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!released && sea.resize(scale.ratio)) wake();
      }, RESIZE_SETTLE_MS);
    });
    resizeObserver.observe(host);

    // ---- GPU context loss: show the photo; rebuild the renderer if the browser gives the context back ----
    const onContextLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      stop();
      showStill();
      say("context lost; still image");
    };
    const onContextRestored = () => {
      if (restores.current >= MAX_CONTEXT_RESTORES) return;
      restores.current++;
      setEpoch((n) => n + 1);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    // ---- ?fps readout ----
    const readoutTimer = readout
      ? window.setInterval(() => {
          if (released) return;
          const now = performance.now();
          const seconds = (now - stats.since) / 1000;
          const fpsNow = stats.frames / seconds;
          const state = document.hidden
            ? "hidden"
            : lost
              ? "context lost"
              : !ready
                ? "loading"
                : raf === 0
                  ? paused
                    ? "paused (still frame)"
                    : "idle"
                  : immersive
                    ? "ocean-only"
                    : covered
                      ? "behind windows"
                      : now - lastInteraction < INTERACTION_LINGER_MS || settling()
                        ? "interacting"
                        : "backdrop";
          const buffer = sea.renderer.getContext().drawingBufferWidth + "×" + sea.renderer.getContext().drawingBufferHeight;
          readout.textContent =
            `${fpsNow.toFixed(1)} fps  ${stats.frames ? (stats.intervalMs / stats.frames).toFixed(1) : "–"} ms` +
            `  cpu ${stats.frames ? (stats.cpuMs / stats.frames).toFixed(1) : "–"} ms\n` +
            `scale ${scale.ratio.toFixed(2)} (${scale.min.toFixed(2)}–${scale.max.toFixed(2)})  dpr ${devicePixelRatio.toFixed(2)}\n` +
            `${buffer} px  target ${lastFps || "–"} fps\n` +
            `${state} · ${sea.mode}${paused ? " · paused" : ""}${compact ? " · light" : ""}`;
          stats.frames = stats.intervalMs = stats.cpuMs = 0;
          stats.since = now;
        }, 500)
      : 0;

    function release() {
      if (released) return;
      released = true;
      stop();
      clearTimeout(resizeTimer);
      clearTimeout(stillTimer);
      showStill();
      resizeObserver.disconnect();
      unsubscribe();
      motionQuery.removeEventListener("change", updatePaused);
      document.removeEventListener("visibilitychange", onVisibility);
      surface.removeEventListener("pointerdown", onDown);
      surface.removeEventListener("wheel", onWheel);
      surface.style.touchAction = previousTouchAction;
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      // Remove these before dispose(): it forces a context loss of its own.
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      sea.dispose();
    }

    schedule();
    return () => {
      release();
      clearInterval(readoutTimer);
      readout?.remove();
    };
  }, [epoch]);

  return (
    <>
      <div
        ref={stillRef}
        className="absolute inset-0 w-full h-full z-[-10] ocean-still"
        style={{ background: "#1d3643 center 34% / cover no-repeat", backgroundImage: "var(--ocean-still-image)" }}
        aria-hidden="true"
      />
      <div
        ref={hostRef}
        className="absolute inset-0 w-full h-full z-[-10] ocean-wallpaper"
        data-wallpaper-interactive=""
        aria-hidden="true"
        style={{ touchAction: "none" }}
      />
    </>
  );
}
