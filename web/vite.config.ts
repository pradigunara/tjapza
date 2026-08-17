import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../pb/pb_public',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
