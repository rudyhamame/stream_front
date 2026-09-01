import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const browserProxy = {
  '/api/xtream/hls': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api/xtream/play': { target: 'http://127.0.0.1:8788', changeOrigin: true },
  '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true }
};
const allowedHosts = ['rudy-hp-pavilion-x360-convertible-14-ba0xx.tailb5a10d.ts.net'];

export default defineConfig({
  plugins: [vue()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts, proxy: browserProxy },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts, proxy: browserProxy }
});
