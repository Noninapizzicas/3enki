import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    host: true, // Escuchar en todas las interfaces
    proxy: {
      // Proxy para APIs del backend
      '/modules': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Proxy para WebSocket MQTT
      '/mqtt': {
        target: 'ws://localhost:9001',
        ws: true
      }
    }
  }
});
