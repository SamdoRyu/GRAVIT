import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Vendor chunks change far less often than app code, so they stay cached across deploys.
        // three.js alone is ~740 kB minified (190 kB gzip) and can't be split further; it only loads
        // with the lazy 3D view, after the HUD.
        codeSplitting: {
          groups: [
            // Groups pull in their dependencies recursively, so the libraries the HUD needs (react,
            // zustand) get their own higher-priority group; otherwise they'd land in 'r3f' and the
            // entry would statically import (and preload) three.js after all.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/, priority: 20 },
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 10 },
            { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|troika|maath|camera-controls|meshline)/, priority: 5 },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: {
      // Local Spring Boot server (backend/, default :8080). API_PORT overrides the port.
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT ?? 8080}`,
        // Keep the browser's Host (localhost:5173) so Spring builds redirects/cookies for the Vite origin,
        // the same origin the session cookie and CSRF token (XSRF-TOKEN) will live on.
        changeOrigin: false,
        configure: (proxy) => {
          // Vite only ends a proxied response on upstream errors before headers are sent. For the
          // long-lived SSE stream that leaves the browser "connected" to a dead server, so close
          // the browser side as soon as the upstream goes away.
          proxy.on('proxyRes', (upstream, _req, res) => {
            upstream.on('close', () => {
              if (!res.writableEnded) res.destroy()
            })
          })
          proxy.on('error', (_err, _req, res) => {
            if ('headersSent' in res && res.headersSent) res.destroy()
          })
        },
      },
    },
  },
})
