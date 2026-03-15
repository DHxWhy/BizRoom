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
        // Vite 8 (Rolldown) requires manualChunks to be a function, not an object
        manualChunks(id: string) {
          if (id.includes("node_modules/three/")) return "three";
          if (
            id.includes("node_modules/@react-three/fiber/") ||
            id.includes("node_modules/@react-three/drei/")
          )
            return "r3f";
        },
      },
    },
  },
});
