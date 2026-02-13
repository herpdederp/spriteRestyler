import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Sprite Restyler",
        short_name: "Sprites",
        description: "Restyle and transform pixel art sprites",
        theme_color: "#0c0c1a",
        background_color: "#0c0c1a",
        display: "standalone",
        start_url: "/spriteRestyler/",
        scope: "/spriteRestyler/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
    }),
  ],
  base: "/spriteRestyler/",
});
