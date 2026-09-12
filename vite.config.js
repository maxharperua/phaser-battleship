import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      external: ['phaser'],
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
