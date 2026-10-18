// NAGI ocean runtime adapted as a reusable module (derived from NAGI's src/ocean.js, MIT — see vendor/nagi/LICENSE).
// Differences from the original: no built-in UI, an externally driven camera, a surface ring that follows the
// viewer, a caller-owned "under-water" scene for refraction/shoreline foam, and a boat wake in the foam history.
import * as THREE from "three-nagi";
import { createSpectralOcean } from "./vendor/nagi/spectral-ocean.js";
import { createCapillaryOcean } from "./vendor/nagi/capillary-ocean.js";
import { createCpuCapillaryOcean } from "./vendor/nagi/cpu-capillary-ocean.js";
import { createAtmosphere } from "./vendor/nagi/atmosphere.js";
import { installPrefilterUniforms } from "./vendor/nagi/prefiltered-environment.js";
import { createOceanMotion } from "./vendor/nagi/ocean-motion.js";
import { PHOTO_SKY_GLSL, installPhotoSkyUniforms, loadPhotoSky } from "./vendor/nagi/photo-sky.js";
import { installRefractionUniforms, createRefractionPass } from "./vendor/nagi/refraction.js";
import { shaderCommon, vertex, fragment, foamFragment } from "./sea-shaders.js";

// "light" is for phones and tablets: coarser grid and foam, no MSAA, 2048 px sky photos (a quarter of the GPU memory).
const PROFILES = {
  balanced: { rate: 30, detail: 1, rings: 384, segments: 512, foam: 512, sky: ["/ocean/sky-dawn-base.jpg", "/ocean/sky-dawn-gain.jpg"] },
  light: { rate: 20, detail: 0, rings: 256, segments: 384, foam: 256, sky: ["/ocean/sky-dawn-base-2048.jpg", "/ocean/sky-dawn-gain-2048.jpg"] },
};

// The sky radiance table ships gzipped (4 MB → 2 MB). Inflate it here unless the server already did.
async function fetchRadiance(signal) {
  const compressed = typeof DecompressionStream === "function";
  const response = await fetch(compressed ? "/ocean/sky-radiance.bin.gz" : "/ocean/sky-radiance.bin", { signal });
  if (!response.ok) throw new Error("sky radiance unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes.buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function sunVector(elevation) {
  return new THREE.Vector3(-0.79863551 * Math.cos(elevation), Math.sin(elevation), -0.60181502 * Math.cos(elevation));
}

export function createSea({ container, quality = "balanced", pixelRatio = 1, sunDegrees = 34, wave = 0.85, wind = 0.7 }) {
  const profile = PROFILES[quality];
  const motion = createOceanMotion();
  const uniforms = {
    ...motion.uniforms,
    uSpectralSize: { value: 256 },
    uSkyReflectionBlur: { value: 0.22 },
    uEnvironmentIntensity: { value: 1 },
    uSunDirection: { value: new THREE.Vector3() },
    uSeabedUseSunDirection: { value: 1 },
    uSeabedCaustics: { value: 0.55 },
    uGridRadialStep: { value: Math.log(9601) / profile.rings },
    uGridAngularStep: { value: (2 * Math.PI) / profile.segments },
    uTime: { value: 0 },
    uWave: { value: wave },
    uWind: { value: wind },
    uSun: { value: (sunDegrees * Math.PI) / 180 },
    uMood: { value: 1 },
    uDetail: { value: profile.detail },
    uFoamPattern: { value: null },
    uFoamPatternReady: { value: 0 },
    uFoamTex: { value: null },
    uFoamAnchor: { value: new THREE.Vector2(0, 0) },
    uFoamScale: { value: 1 },
    uFoamReady: { value: 0 },
    uCapillaryReady: { value: 0 },
    uCapillary0: { value: null },
    uCapillary1: { value: null },
    uSpectral: { value: 0 },
    uFieldLarge: { value: null },
    uFieldSmall: { value: null },
    uFieldFine: { value: null },
    uNormalLarge: { value: null },
    uNormalSmall: { value: null },
    uNormalFine: { value: null },
    uEnvironmentReady: { value: 0 },
    uEnvironmentMix: { value: 1 },
    uEnvironmentSizeA: { value: 256 },
    uEnvironmentSizeB: { value: 256 },
    uEnvironmentA: { value: null },
    uEnvironmentB: { value: null },
    uSkySun: { value: (sunDegrees * Math.PI) / 180 },
    uSkyMood: { value: 1 },
    uSolarColor: { value: new THREE.Vector3(1, 0.7, 0.3) },
    uSeaOrigin: { value: new THREE.Vector2(0, -8) },
    uBoat: { value: new THREE.Vector4(0, 0, 0, -1) },
    uBoatSpeed: { value: 0 },
  };
  installPrefilterUniforms(THREE, uniforms);
  installRefractionUniforms(THREE, uniforms);
  installPhotoSkyUniforms(uniforms);

  let shaderFailure = null;
  let disposed = false;
  let guarded = false;
  // "default", not "high-performance": a wallpaper should not wake a laptop's discrete GPU.
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== "light", powerPreference: "default" });
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw new Error("WebGL 2 required");
  }
  // The canvas keeps its CSS size (100%); only the drawing buffer follows the container and the pixel ratio.
  let ratio = pixelRatio;
  renderer.setPixelRatio(ratio);
  renderer.setSize(container.clientWidth || innerWidth, container.clientHeight || innerHeight, false);
  // The ocean shaders tone-map themselves; built-in materials (islands, boat) use ACES + sRGB on screen,
  // and stay linear inside the refraction target, which the ocean tone-maps.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const error = new Error(`${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vs)} ${gl.getShaderInfoLog(fs)}`);
    if (guarded) throw error;
    shaderFailure = error;
  };

  const scene = new THREE.Scene();
  const underScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    (container.clientWidth || innerWidth) / (container.clientHeight || innerHeight),
    0.3,
    5000,
  );

  // Polar grid around (0, 8) in object space; uSeaOrigin moves it with the viewer.
  function oceanGeometry() {
    const { rings, segments } = profile;
    const vertices = [0, 0, 8];
    const indices = [];
    for (let r = 1; r <= rings; r++) {
      const radius = 0.25 * (Math.exp((r / rings) * Math.log(9601)) - 1);
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        vertices.push(Math.cos(a) * radius, 0, 8 + Math.sin(a) * radius);
      }
    }
    for (let j = 0; j < segments; j++) indices.push(0, 1 + ((j + 1) % segments), 1 + j);
    for (let r = 1; r < rings; r++)
      for (let j = 0; j < segments; j++) {
        const a = 1 + (r - 1) * segments + j;
        const b = 1 + (r - 1) * segments + ((j + 1) % segments);
        const c = 1 + r * segments + j;
        const d = 1 + r * segments + ((j + 1) % segments);
        indices.push(a, b, c, b, d, c);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  const sea = new THREE.Mesh(
    oceanGeometry(),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide }),
  );
  sea.frustumCulled = false;
  sea.renderOrder = 1;
  scene.add(sea);

  const skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader:
        "varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.);}",
      fragmentShader:
        shaderCommon +
        PHOTO_SKY_GLSL +
        "varying vec3 vDir;void main(){vec3 d=normalize(vDir);gl_FragColor=vec4(tonemap(uPhotoSkyReady>.5?photographicSky(d):sky(d,true)),1.);}",
    }),
  );
  skyMesh.renderOrder = -1;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // Wave field: GPU spectral → GPU capillary → CPU capillary → analytic ripples.
  let spectral = null;
  let capillary = null;
  const clearSpectral = () => {
    for (const key of ["uFieldLarge", "uFieldSmall", "uFieldFine", "uNormalLarge", "uNormalSmall", "uNormalFine"])
      uniforms[key].value = null;
    uniforms.uSpectral.value = 0;
  };
  try {
    guarded = true;
    spectral = createSpectralOcean(THREE, renderer);
    if (spectral) {
      spectral.update(0, profile.rate);
      spectral.validate();
      const [a, b, c] = spectral.cascades;
      uniforms.uFieldLarge.value = a.output.textures[0];
      uniforms.uFieldSmall.value = b.output.textures[0];
      uniforms.uFieldFine.value = c.output.textures[0];
      uniforms.uNormalLarge.value = a.output.textures[1];
      uniforms.uNormalSmall.value = b.output.textures[1];
      uniforms.uNormalFine.value = c.output.textures[1];
      uniforms.uSpectral.value = 1;
    }
  } catch (error) {
    spectral?.dispose();
    spectral = null;
    clearSpectral();
    renderer.setRenderTarget(null);
    console.warn("[sea] spectral waves unavailable; using Gerstner ocean", error);
  } finally {
    guarded = false;
  }
  const startCpuCapillary = (time) => {
    try {
      capillary = createCpuCapillaryOcean(THREE, renderer);
      capillary.update(time);
      capillary.validate();
      uniforms.uCapillary0.value = capillary.bands[0].output.texture;
      uniforms.uCapillary1.value = capillary.bands[1].output.texture;
      uniforms.uCapillaryReady.value = 2;
    } catch (error) {
      capillary?.dispose();
      capillary = null;
      uniforms.uCapillaryReady.value = 0;
      console.warn("[sea] CPU ripples unavailable; using analytic ripples", error);
    }
  };
  if (!spectral) {
    try {
      guarded = true;
      capillary = createCapillaryOcean(THREE, renderer);
      if (capillary) {
        capillary.update(0, profile.rate);
        capillary.validate();
        uniforms.uCapillary0.value = capillary.bands[0].output.texture;
        uniforms.uCapillary1.value = capillary.bands[1].output.texture;
        uniforms.uCapillaryReady.value = 1;
      }
    } catch (error) {
      capillary?.dispose();
      capillary = null;
      renderer.setRenderTarget(null);
    } finally {
      guarded = false;
    }
    if (!capillary) startCpuCapillary(0);
  }

  // Foam history: a 400 m window that follows the view and keeps whitecaps and wake for a few seconds.
  let updateFoam = () => {};
  let disposeFoam = () => {};
  try {
    const foamType = renderer.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
    uniforms.uFoamScale.value = foamType === THREE.UnsignedByteType ? 2.1 : 1;
    const size = profile.foam;
    const targets = [0, 1].map(
      () =>
        new THREE.WebGLRenderTarget(size, size, {
          type: foamType,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        }),
    );
    const foamUniforms = {
      ...uniforms,
      uPreviousFoam: { value: targets[0].texture },
      uSimDt: { value: 0 },
      uFoamDelta: { value: new THREE.Vector2() },
      uFoamResolution: { value: size },
      uFoamQuantized: { value: foamType === THREE.UnsignedByteType ? 1 : 0 },
    };
    const foamScene = new THREE.Scene();
    const foamCamera = new THREE.Camera();
    const foamQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: foamUniforms,
        vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
        fragmentShader: foamFragment,
        depthTest: false,
        depthWrite: false,
      }),
    );
    foamScene.add(foamQuad);
    disposeFoam = () => {
      for (const target of targets) target.dispose();
      foamQuad.geometry.dispose();
      foamQuad.material.dispose();
    };
    const gl = renderer.getContext();
    for (const target of targets) {
      renderer.setRenderTarget(target);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("foam framebuffer");
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    let read = 0;
    let initialized = false;
    const dir = new THREE.Vector3();
    updateFoam = (dt) => {
      if (dt <= 0) return;
      const cell = 400 / size;
      camera.getWorldDirection(dir);
      const distance = dir.y < -0.01 ? -camera.position.y / dir.y : 0;
      const ax = Math.round((camera.position.x + Math.max(-152, Math.min(152, dir.x * distance))) / cell) * cell;
      const az = Math.round((camera.position.z + Math.max(-152, Math.min(152, dir.z * distance))) / cell) * cell;
      const dx = ax - uniforms.uFoamAnchor.value.x;
      const dz = az - uniforms.uFoamAnchor.value.y;
      uniforms.uFoamAnchor.value.set(ax, az);
      if (!initialized || Math.abs(dx) > 200 || Math.abs(dz) > 200) {
        for (const target of targets) {
          renderer.setRenderTarget(target);
          renderer.clear();
        }
        renderer.setRenderTarget(null);
        read = 0;
        initialized = true;
        uniforms.uFoamTex.value = targets[0].texture;
        uniforms.uFoamReady.value = 1;
        return;
      }
      const write = 1 - read;
      foamUniforms.uPreviousFoam.value = targets[read].texture;
      foamUniforms.uFoamDelta.value.set(dx, dz);
      foamUniforms.uSimDt.value = dt;
      renderer.setRenderTarget(targets[write]);
      renderer.render(foamScene, foamCamera);
      renderer.setRenderTarget(null);
      read = write;
      uniforms.uFoamTex.value = targets[read].texture;
    };
  } catch (error) {
    uniforms.uFoamReady.value = 0;
    renderer.setRenderTarget(null);
    console.warn("[sea] foam history unavailable", error);
  }

  // Islands and the boat hull live in underScene too, so the water refracts them and draws contact foam.
  let refraction = null;
  try {
    refraction = createRefractionPass(THREE, renderer, underScene, uniforms);
  } catch (error) {
    console.warn("[sea] refraction unavailable", error);
  }

  // Sky photograph + HDR atmosphere (CC0), and the foam pattern texture.
  let atmosphere = null;
  let photoSky = null;
  let foamPattern = null;
  const assetsController = new AbortController();
  const assets = [];
  if (renderer.extensions.has("EXT_color_buffer_float")) {
    const controller = assetsController;
    const timeout = setTimeout(() => controller.abort(), 12000);
    assets.push(
      fetchRadiance(controller.signal)
        .then(async (buffer) => {
          photoSky = await loadPhotoSky(THREE, uniforms, { signal: controller.signal, urls: profile.sky }).catch((e) =>
            console.warn("[sea] photo sky unavailable", e),
          );
          if (disposed) {
            photoSky?.dispose();
            return; // the renderer was released while assets loaded (e.g. a React remount)
          }
          guarded = true;
          try {
            atmosphere = createAtmosphere(
              THREE,
              renderer,
              uniforms,
              { sun: uniforms.uSun.value, mood: uniforms.uMood.value, time: 0 },
              new Uint8Array(buffer),
            );
          } finally {
            guarded = false;
          }
        })
        .catch((error) => {
          if (disposed) return;
          atmosphere = null;
          uniforms.uEnvironmentReady.value = 0;
          console.warn("[sea] atmosphere unavailable; analytic sky", error);
        })
        .finally(() => clearTimeout(timeout)),
    );
  }
  assets.push(
    new Promise((resolve) => {
      new THREE.TextureLoader().load(
        "/ocean/foam-pattern.webp",
        (texture) => {
          if (disposed) {
            texture.dispose();
            return resolve();
          }
          foamPattern = texture;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.NoColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.needsUpdate = true;
          uniforms.uFoamPattern.value = texture;
          uniforms.uFoamPatternReady.value = 1;
          resolve();
        },
        undefined,
        () => resolve(),
      );
    }),
  );
  const ready = Promise.all(assets);

  let time = 0;
  function update(dt, { paused = false } = {}) {
    if (!paused) time += dt;
    uniforms.uTime.value = time;
    // Ring centre under the camera; snap to 0.5 m so near-field vertices don't shimmer while moving.
    uniforms.uSeaOrigin.value.set(Math.round(camera.position.x * 2) / 2, Math.round(camera.position.z * 2) / 2 - 8);
    if (spectral && !paused) {
      try {
        spectral.update(time, profile.rate, uniforms.uWave.value * Math.pow((5 + 12.5 * uniforms.uWind.value) / 15, 0.33));
      } catch (error) {
        spectral.dispose();
        spectral = null;
        clearSpectral();
        renderer.setRenderTarget(null);
        console.warn("[sea] spectral failed; Gerstner fallback", error);
        if (!capillary) startCpuCapillary(time);
      }
    }
    if (capillary && !paused) {
      try {
        capillary.update(time, profile.rate);
      } catch {
        capillary.dispose();
        capillary = null;
        uniforms.uCapillaryReady.value = 0;
        renderer.setRenderTarget(null);
      }
    }
    motion.advance(paused ? 0 : dt, uniforms.uWind.value, uniforms.uSpectral.value);
    updateFoam(paused ? 0 : dt);
    if (atmosphere) {
      try {
        atmosphere.update({ sun: uniforms.uSun.value, mood: uniforms.uMood.value, time }, dt, quality, paused);
      } catch (error) {
        atmosphere.dispose();
        atmosphere = null;
        uniforms.uEnvironmentReady.value = 0;
        console.warn("[sea] atmosphere update failed", error);
      }
    }
    const e = uniforms.uEnvironmentReady.value > 0.5 ? uniforms.uSkySun.value : uniforms.uSun.value;
    uniforms.uSunDirection.value.copy(sunVector(e));
  }

  function render() {
    if (disposed) return;
    if (shaderFailure) throw shaderFailure;
    // The refraction pass draws the under-water scene into a full-size colour + depth target. With nothing in it
    // (the wallpaper has no islands or boat) the water shader's result is identical without it, so skip the pass.
    if (refraction && underScene.children.length) refraction.render(camera);
    else uniforms.uRefractionReady.value = 0;
    renderer.render(scene, camera);
  }

  let width = 0;
  let height = 0;
  /** Match the drawing buffer to the container and the given pixel ratio; no-op when nothing changed. */
  function resize(nextRatio = ratio) {
    const w = container.clientWidth || innerWidth;
    const h = container.clientHeight || innerHeight;
    if (w === width && h === height && nextRatio === ratio && renderer.getPixelRatio() === ratio) return false;
    width = w;
    height = h;
    ratio = nextRatio;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    return true;
  }

  function dispose() {
    disposed = true;
    assetsController.abort();
    spectral?.dispose();
    capillary?.dispose();
    atmosphere?.dispose?.();
    refraction?.dispose();
    photoSky?.dispose();
    foamPattern?.dispose();
    disposeFoam();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  return {
    THREE,
    renderer,
    scene,
    underScene,
    camera,
    uniforms,
    ready,
    update,
    render,
    resize,
    dispose,
    sunDirection: () => uniforms.uSunDirection.value,
    get pixelRatio() {
      return ratio;
    },
    get mode() {
      return spectral ? "spectral" : capillary ? "capillary" : "analytic";
    },
  };
}
