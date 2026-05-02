import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '₮ubikz — тюбики собираются здесь',
  description: 'минималистичный мессенджер для тюбиков',
  manifest: '/manifest.webmanifest',
  applicationName: '₮ubikz',
  appleWebApp: {
    capable: true,
    title: '₮ubikz',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
  // Prevent the iOS pinch-zoom from sticking after the keyboard hides — it
  // would otherwise leave the chat in a zoomed-in state with the header
  // pushed off-screen.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // When the soft keyboard opens, resize the layout viewport itself instead
  // of scrolling the page. Without this, iOS leaves a black gap between the
  // composer and the keyboard. Supported on iOS 16.4+ and modern Chromium.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark" style={{ height: '100%' }}>
      {/*
        AppShell is positioned fixed against the visual viewport (driven
        by --app-h / --app-top), so body itself just needs to be a fully
        covered, non-scrollable surface. overscroll-none kills the rubber-
        band that would otherwise leak the bg color above/below.
      */}
      <body
        className="bg-bg text-text font-sans overflow-hidden overscroll-none"
        style={{ height: '100%', margin: 0 }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
