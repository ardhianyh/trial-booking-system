import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig({
   plugins: [react()],
   server: {
      host: true,
      port: 5173,
      watch: { usePolling: true },
      proxy: {
         '/api': { target: apiTarget, changeOrigin: true },
      },
   },
});
