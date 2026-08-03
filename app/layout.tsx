import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted fonts (SIL OFL, committed under app/fonts/) so the static export stays
// fully offline — no next/font/google fetch at build time (CI network is blocked).
const display = localFont({
  src: [
    { path: "./fonts/SpaceGrotesk-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SpaceGrotesk-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const mono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Surveillance Radar",
  description:
    "Interactive public map of documented law-enforcement surveillance technology in the United States. Data from EFF Atlas of Surveillance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
