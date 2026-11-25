import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api/v1': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
  build: { outDir: 'dist-local', rollupOptions: { input: { demo: fileURLToPath(new URL('./index.html', import.meta.url)), integration: fileURLToPath(new URL('./api-local.html', import.meta.url)) } } },
});
