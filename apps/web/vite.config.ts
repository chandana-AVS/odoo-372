import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Bind every interface: on Windows, "localhost" can bind ::1 only, which
    // leaves an IPv4 client hitting whatever else holds the port. Port 5180
    // avoids a clash with other Vite projects already using the 5173 default.
    host: true,
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
