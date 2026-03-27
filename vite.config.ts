import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("xlsx")) {
            return "xlsx";
          }

          if (id.includes("@mui") || id.includes("@emotion")) {
            return "mui-vendor";
          }

          if (id.includes("react-router")) {
            return "router-vendor";
          }

          if (
            id.includes("react") ||
            id.includes("scheduler") ||
            id.includes("prop-types")
          ) {
            return "react-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
