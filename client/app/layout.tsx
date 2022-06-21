import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { AdsProvider } from "./components/Ads";

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

// URL publique du site, utilisée pour les liens absolus du partage social.
// À définir dans l'environnement (NEXT_PUBLIC_SITE_URL) lors du déploiement.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chat.example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CHAT — Random video chat",
    template: "%s · CHAT",
  },
  description:
    "CHAT connects you instantly with random people around the world over live video. One click to meet someone new.",
  applicationName: "CHAT",
  keywords: [
    "random video chat",
    "video chat",
    "talk to strangers",
    "meet new people",
    "webcam chat",
    "live video",
    "omegle alternative",
  ],
  authors: [{ name: "CHAT" }],
  category: "social",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "CHAT",
    title: "CHAT — Random video chat",
    description:
      "Meet random people over live video. One click to start a conversation.",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "CHAT — Random video chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CHAT — Random video chat",
    description:
      "Meet random people over live video. One click to start a conversation.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

// Publicités activées seulement si au moins une zone ExoClick est configurée
const adsEnabled = Boolean(
  process.env.NEXT_PUBLIC_EXOCLICK_ZONE_TERMS ||
    process.env.NEXT_PUBLIC_EXOCLICK_ZONE_LOBBY ||
    process.env.NEXT_PUBLIC_EXOCLICK_ZONE_INTERSTITIAL ||
    process.env.NEXT_PUBLIC_EXOCLICK_ZONE_FOOTER
);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a73e8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AdsProvider enabled={adsEnabled}>{children}</AdsProvider>
      </body>
    </html>
  );
}
