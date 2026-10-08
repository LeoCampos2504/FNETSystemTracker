import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// Figtree: clean, open shapes that stay readable at small sizes on field phones.
const sans = Figtree({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "FNET System Tracker",
  description: "Plataforma interna de planificación y coordinación de operaciones FNET.",
  applicationName: "FNET System Tracker",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0e1c3d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={sans.variable}><body>{children}</body></html>;
}
