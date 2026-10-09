import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['127.0.0.1'],
    cors: false,
    proxy: { '/api': 'http://127.0.0.1:4173' },
  },
  build: { outDir: 'dist/client', emptyOutDir: true },
});
