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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen bg-bg text-text font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
