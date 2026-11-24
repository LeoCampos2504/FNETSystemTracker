import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
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
  return <html lang="es" data-theme="light" suppressHydrationWarning className={sans.variable}>
    <head>
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var saved=localStorage.getItem("fnet-theme");var theme=saved==="dark"||saved==="light"?saved:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch(_){}})()` }} />
    </head>
    <body><ThemeToggle className="global-theme-toggle" />{children}</body>
  </html>;
}
