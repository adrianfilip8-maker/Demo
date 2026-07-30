import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: false },
  preview: { host: '0.0.0.0', port: 4173, strictPort: false },
  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
  },
  // Shaders live in .glsl siblings when a file gets long enough to warrant it.
  assetsInclude: ['**/*.glsl'],
});
