import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Azeret_Mono } from "next/font/google";
import "./globals.css";
import { AccessibilityProvider } from "@/components/providers/accessibility-provider";
import { ServiceWorkerRegistration } from "@/components/providers/service-worker";
import { AmplifyInit } from "@/components/providers/amplify-init";
import { I18nProvider } from "@/i18n/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* The studio's two faces: a high-contrast display serif for voice, a
   monospace for data. Loaded here so every route inherits them. */
const editorialSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif-editorial",
});

const editorialMono = Azeret_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono-editorial",
});

export const metadata: Metadata = {
  title: "SkillBridge",
  description:
    "Voice-first vocational training for industrial maintenance workers, in your own language.",
  appleWebApp: { capable: true, title: "SkillBridge" },
};

export const viewport: Viewport = {
  themeColor: "#e7e3da",
  // The target device is a phone held on a shop floor; zoom stays enabled
  // because pinch-to-zoom is a real accessibility affordance here.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${editorialSerif.variable} ${editorialMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AccessibilityProvider>
          <I18nProvider>{children}</I18nProvider>
        </AccessibilityProvider>
        <ServiceWorkerRegistration />
        <AmplifyInit />
      </body>
    </html>
  );
}
