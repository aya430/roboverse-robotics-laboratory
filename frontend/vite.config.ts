import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default './' (relative paths) so the built site works from any folder, serve.mjs, START_ROBOVERSE.bat,
// Cloudflare Pages, etc. The GitHub Pages workflow (.github/workflows/deploy.yml) builds with
// VITE_BASE=/roboverse-robotics-laboratory/ so every asset, worker and WASM URL is absolute to the project site.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || './',
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
