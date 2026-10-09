import { defineConfig } from 'vite';

export default defineConfig({
  // Application credentials belong exclusively to the Node host.
  envDir: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['127.0.0.1'],
    cors: false,
    // Rewrite only the upstream Host; retain the browser Origin for C5's exact check.
    proxy: { '/api': { target: 'http://127.0.0.1:4173', changeOrigin: true } },
  },
  build: { outDir: 'dist/client', emptyOutDir: true },
});
