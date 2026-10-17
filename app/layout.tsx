import type { Metadata, Viewport } from "next";
import "./globals.css";
import OfflineRuntime from "@/componentes/offline-runtime";

export const metadata: Metadata = {
  title: "BOOM POS | Gestión comercial",
  description: "Sistema POS, inventario y gestión comercial de Somos Software",
  applicationName: "BOOM POS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BOOM POS" },
  icons: { icon: "/boom-icon.svg", apple: "/boom-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><OfflineRuntime />{children}</body></html>;
}
