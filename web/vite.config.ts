import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Sureshot runs on its own ports so it never collides with other local projects.
const API = 'http://127.0.0.1:4300';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5473,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: true }, '/socket.io': { target: API, ws: true } },
  },
  preview: { port: 5473 },
});
