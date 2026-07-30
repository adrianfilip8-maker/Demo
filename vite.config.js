import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Capture tools set SANDS_NO_HMR. Agents edit src/ while captures run, and an HMR
    // reload mid-`page.evaluate` destroys the execution context and fails the shot with a
    // confusing "context was destroyed" error. A capture wants a frozen build, not a live one.
    hmr: process.env.SANDS_NO_HMR ? false : undefined,
    watch: process.env.SANDS_NO_HMR ? { ignored: ['**/*'] } : undefined,
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: false },
  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
  },
  // Shaders live in .glsl siblings when a file gets long enough to warrant it.
  assetsInclude: ['**/*.glsl'],
});
