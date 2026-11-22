import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 56500,
    strictPort: true,
    host: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  optimizeDeps: {
    include: [
      '@tensorflow/tfjs',
      '@tensorflow-models/body-segmentation',
    ],
    exclude: [
      '@mediapipe/selfie_segmentation',
    ],
  },
  resolve: {
    alias: {
      // Shim for @mediapipe/selfie_segmentation which doesn't export ES modules
      '@mediapipe/selfie_segmentation': path.resolve(__dirname, 'src/shims/mediapipe-selfie-segmentation.js'),
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});