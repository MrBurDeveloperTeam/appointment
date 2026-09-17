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
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: false,
      allowedHosts: true,
    }
  };
});
