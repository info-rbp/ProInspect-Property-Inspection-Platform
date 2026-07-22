import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  server: { port: 3000, host: '0.0.0.0' },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor';
          if (id.includes('node_modules/@firebase/firestore') || id.includes('node_modules/firebase/firestore')) return 'firebase-firestore';
          if (id.includes('node_modules/@firebase/storage') || id.includes('node_modules/firebase/storage')) return 'firebase-storage';
          if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/@firebase/app-check') || id.includes('node_modules/firebase/app-check')) return 'firebase-app-check';
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase/')) return 'firebase-core';
          return undefined;
        },
      },
    },
  }
});
