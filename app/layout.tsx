import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Somos Software POS",
  description: "Sistema POS y gestión comercial"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
