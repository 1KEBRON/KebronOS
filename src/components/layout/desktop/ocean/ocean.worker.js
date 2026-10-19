// GPU setup, geometry, texture decoding and shader compilation stay off the UI thread.
let renderer;
let size;
let lastFrame = 0;
const send = (type, data = {}) => self.postMessage({ type, ...data });
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      size = { clientWidth: data.width, clientHeight: data.height };
      const { canvas, compact, ratio } = data;
      if (data.engine === 'webgpu') {
        const { createWebOcean } = await import('./vendor/web-ocean/web-ocean.js');
        const ocean = await createWebOcean({
          container: size, canvas, pixelRatio: ratio, msaa: compact ? 1 : 4,
          params: { sunAzim: data.width > data.height ? 18 : 4 },
          onLost: () => { send('lost'); send('restored'); },
        });
        renderer = {
          mode: 'web-ocean',
          draw(dt, paused, camera) {
            Object.assign(ocean.camera, camera, { yaw: -camera.yaw });
            ocean.render(paused ? 0 : dt);
          },
          resize: (r) => ocean.resize(r),
          state: () => ({ time: ocean.time, floor: ocean.waterHeight + 0.9, buffer: ocean.bufferSize.join('×') }),
        };
      } else {
        const { createSea, Vector3 } = await import('./sea.js');
        const sea = createSea({ container: size, canvas, quality: compact ? 'light' : 'balanced', pixelRatio: ratio, sunDegrees: 2.6 });
        canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); send('lost'); });
        canvas.addEventListener('webglcontextrestored', () => send('restored'));
        const look = new Vector3();
        await sea.ready;
        renderer = {
          mode: sea.mode,
          draw(dt, paused, camera) {
            sea.camera.position.set(camera.x, camera.y, camera.z);
            look.set(camera.x - Math.sin(camera.yaw) * Math.cos(camera.pitch) * 100,
              camera.y + Math.sin(camera.pitch) * 100,
              camera.z - Math.cos(camera.yaw) * Math.cos(camera.pitch) * 100);
            sea.camera.lookAt(look);
            sea.update(dt, { paused });
            sea.render();
          },
          resize: (r) => sea.resize(r),
          state: () => ({ time: sea.uniforms.uTime.value || 0, floor: 0, buffer: canvas.width + '×' + canvas.height }),
        };
      }
      send('ready', { mode: renderer.mode });
    } else if (data.type === 'draw' && renderer) {
      const now = performance.now();
      const interval = lastFrame ? now - lastFrame : 0;
      lastFrame = now;
      renderer.draw(data.dt, data.paused, data.camera);
      send('frame', { ...renderer.state(), interval });
    } else if (data.type === 'resize' && renderer) {
      size.clientWidth = data.width;
      size.clientHeight = data.height;
      renderer.resize(data.ratio);
    }
  } catch (error) {
    send('error', { message: error.message || String(error) });
  }
};
