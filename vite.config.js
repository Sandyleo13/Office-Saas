import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4100",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:4100",
        changeOrigin: true,
      }
    }
  }
});