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
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      // Proxy para WebSocket MQTT
      '/mqtt': {
        target: 'ws://127.0.0.1:9001',
        ws: true,
        secure: false
      }
    }
  }
});
