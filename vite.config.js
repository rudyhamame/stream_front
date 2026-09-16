import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import os from 'node:os';

const browserProxy = {
  '/api/xtream/hls': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  // Must precede '/api/xtream/play' - vite matches the first prefix, and
  // '/api/xtream/play' would otherwise swallow it. playback/release stops the
  // caller's ffmpeg job + provider lease, so it must hit the streamer that
  // owns the job (8788), not the control plane.
  '/api/xtream/playback': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api/xtream/play': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  // Watch with Partner session state lives in the streamer process (with the
  // shared ffmpeg job), not the control plane on 8787.
  '/api/xtream/wwp-sync': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api/xtream/wwp-control': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api/xtream/wwp-call': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true }
};
function getNetworkHosts() {
  try {
    return Object.values(os.networkInterfaces() || {})
      .flatMap((interfaces) => interfaces || [])
      .filter((address) => address.family === 'IPv4' && !address.internal)
      .map((address) => address.address);
  } catch {
    // Interface discovery can be unavailable in restricted build environments.
    // An empty allowlist is sufficient for production builds and localhost use.
    return [];
  }
}

const networkHosts = getNetworkHosts();
const allowedHosts = [...networkHosts];

export default defineConfig({
  plugins: [vue()],
  // hls.js is intentionally lazy-loaded only when web playback starts. Its
  // isolated production chunk is currently just under 600 KiB.
  build: { chunkSizeWarningLimit: 650 },
  server: { host: '127.0.0.1', port: 5173, allowedHosts, proxy: browserProxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts, proxy: browserProxy }
});
