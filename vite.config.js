import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Fix for __dirname in ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load env variables
  const env = loadEnv(mode, ".", "");

  const isDev = mode === "development";

  return {
    plugins: [
      react({
        jsxRuntime: "automatic", // ✅ THIS FIXES "React is not defined"
      }),
    ],

    server: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: false,
      allowedHosts: true,
    },

    // optional but good practice
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },

    define: {
      __APP_ENV__: env.APP_ENV,
    },
  };
});
