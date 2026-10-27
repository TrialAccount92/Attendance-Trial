import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API runs on :8000 (see backend/README.md). Proxying /api keeps the
// browser on one origin so the session cookie works with SameSite=Strict.
const API_TARGET = process.env.API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    // face-api (~1.3 MB) is its own chunk and only loads when a face feature opens.
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@vladmandic/face-api')) return 'face-api'
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('html5-qrcode')) return 'qr-scanner'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react'
        },
      },
    },
  },
})
