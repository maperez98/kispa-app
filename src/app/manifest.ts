import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — Sistema de administración para microempresas`,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0c",
    theme_color: "#ff5a1f",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
