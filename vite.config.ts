import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'chrome120',
    rollupOptions: {
      input: {
        app: 'src/app/index.html',
        offscreen: 'src/offscreen/offscreen.html',
      },
    },
  },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
