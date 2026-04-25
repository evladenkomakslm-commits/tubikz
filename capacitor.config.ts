import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.tubikz.client',
  appName: '₮ubikz',
  // server.url — приложение будет грузить наш живой сайт.
  // Это значит: 1 codebase, обновления через Render → Android получает мгновенно
  // без переcборки APK.
  server: {
    url: 'https://tubikz.onrender.com',
    cleartext: false,
    androidScheme: 'https',
  },
  // webDir нужен, даже если используем server.url — Capacitor требует.
  webDir: 'public',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0b',
    },
  },
};

export default config;
