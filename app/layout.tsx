import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CatGPT · Artificial Feline Intelligence",
  description:
    "A wearable, party-ready AI cat with opinions. Ask it anything and regret it immediately.",
  applicationName: "CatGPT",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CatGPT",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    title: "CatGPT · Artificial Feline Intelligence",
    description: "MEOWdel 9.0. Nine lives, zero patience.",
    type: "website",
    images: [
      {
        url: "/brand/catgpt-logo.png",
        width: 1254,
        height: 1254,
        alt: "CatGPT — a cat-man in yellow cat-eye sunglasses",
      },
    ],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050505",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
