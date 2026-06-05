import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../backend/dist/public',
    emptyOutDir: true,
  },
  server: {
    // Bind to all network interfaces so ngrok can reach this dev server
    host: true,
    // Allow any Host header — required when ngrok rewrites the Host to its own domain
    allowedHosts: true,
    proxy: {
      // HTTP API calls → backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
      // Socket.io WebSocket connections → backend
      // ws: true tells Vite to also proxy WebSocket upgrade requests
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: false,
      },
    },
  },
})
