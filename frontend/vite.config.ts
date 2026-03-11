import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3006,
    proxy: {
      "/api": "http://localhost:7071",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          "r3f": ["@react-three/fiber", "@react-three/drei"],
        },
      },
    },
  },
});
