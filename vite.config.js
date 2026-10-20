import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sharedGamesPlugin } from './node_modules/@mrburdeveloperteam/pet-function/scripts/vite-games.mjs';

// Fix for __dirname in ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {

  // Load env variables from the root directory
  const env = loadEnv(mode, '.', '');

  const isDev = mode === "development";
  return {
    plugins: [react(), sharedGamesPlugin()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      rollupOptions: {
        output: {
          // Stable, separately-cacheable vendor chunks.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('framer-motion')) return 'motion';
            return undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: false,
      allowedHosts: true,
    }
  };
});
