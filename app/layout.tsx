import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"BOOM POS | Gestión comercial",description:"Sistema POS, inventario y gestión comercial de Somos Software",applicationName:"BOOM POS"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><body>{children}</body></html>}
