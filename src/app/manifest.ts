import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trip Park",
    short_name: "Trip Park",
    description: "旅行・キャンプの計画を共有する Web アプリ",
    // PWA 起動時はプロモ LP を経由せずアプリ入口へ
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0f766e",
    theme_color: "#0f766e",
    orientation: "portrait-primary",
    categories: ["travel", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
