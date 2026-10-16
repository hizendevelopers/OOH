import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IBVS Iraq Field Inspections",
    short_name: "IBVS Field",
    description: "Offline-capable billboard field inspections",
    start_url: "/field",
    scope: "/",
    display: "standalone",
    background_color: "#101d32",
    theme_color: "#101d32",
    icons: [
      {
        src: "/field-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/field-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/field-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
