import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// One self-hosted typeface (SIL OFL, committed under app/fonts/) so the static export stays
// fully offline: no next/font/google fetch at build time (CI network is blocked).
const sans = localFont({
  src: [{ path: "./fonts/LibreFranklin-Variable.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Surveillance Radar",
  description:
    "Interactive public map of documented law-enforcement surveillance technology in the United States. Data from EFF Atlas of Surveillance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
