import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BOOM POS — Gestión comercial",
    short_name: "BOOM POS",
    description: "Punto de venta y gestión comercial de Somos Software",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    lang: "es-CL",
    icons: [{ src: "/boom-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
