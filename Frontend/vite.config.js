import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/printers': 'http://127.0.0.1:5000',
      '/printer': 'http://127.0.0.1:5000',
      '/gcode': 'http://127.0.0.1:5000',
      '/queue': 'http://127.0.0.1:5000',
      '/activity': 'http://127.0.0.1:5000',
      '/auth': 'http://127.0.0.1:5000',
      '/users': 'http://127.0.0.1:5000',
      '/history': 'http://127.0.0.1:5000',
      '/filaments': 'http://127.0.0.1:5000',
      '/settings': 'http://127.0.0.1:5000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    globals: true
  }
})
