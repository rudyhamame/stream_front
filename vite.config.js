import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import os from 'node:os';

const browserProxy = {
  '/api/xtream/hls': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api/xtream/play': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true }
};
const networkHosts = Object.values(os.networkInterfaces())
  .flatMap((interfaces) => interfaces || [])
  .filter((address) => address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);
const allowedHosts = [
  'rh.tailb5a10d.ts.net',
  'rudy-hp-pavilion-x360-convertible-14-ba0xx.tailb5a10d.ts.net',
  ...networkHosts,
];

export default defineConfig({
  plugins: [vue()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts, proxy: browserProxy },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts, proxy: browserProxy }
});
