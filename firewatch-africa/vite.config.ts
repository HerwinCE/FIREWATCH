import { defineConfig } from 'vite';
declare const process: { env: Record<string, string | undefined> };
// Backend FastAPI FireWatch sur le port 8010 (le port 8000 peut être pris par un autre projet).
// Pour changer : définir FIREWATCH_API, par ex. http://127.0.0.1:8000
const api = process.env.FIREWATCH_API ?? 'http://127.0.0.1:8010';
export default defineConfig({
  server: { port: 5173, proxy: { '/api': { target: api, changeOrigin: true } } },
  build: {
    // Bibliothèques lourdes isolées : mises en cache par le navigateur, téléchargées seulement si la page les utilise.
    chunkSizeWarningLimit:2000,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('mapbox-gl')) return 'mapbox';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          if (id.includes('@tanstack') || id.includes('zustand')) return 'data';
          if (id.includes('lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
});
