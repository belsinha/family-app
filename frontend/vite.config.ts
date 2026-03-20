import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev/preview: real server serves this in production; stub so the script tag never 404s. */
function apiConfigStub(): Plugin {
  const sendStub = (_req: unknown, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.end('window.__FAMILY_APP_API_BASE__="";');
  };
  return {
    name: 'api-config-stub',
    configureServer(server) {
      server.middlewares.use('/api-config.js', sendStub);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api-config.js', sendStub);
    },
  };
}

export default defineConfig({
  plugins: [react(), apiConfigStub()],
  server: {
    port: 3000,
    host: '0.0.0.0', // Listen on all network interfaces
    strictPort: false,
  },
});
