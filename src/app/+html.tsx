import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML template for Expo Router's static web output.
 * This becomes dist/index.html (and the other generated route documents).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#4f46e5" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="大白小白出遊去" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png" />
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerBootstrap }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

const serviceWorkerBootstrap = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(function (registration) {
        registration.update();
        window.setInterval(function () { registration.update(); }, 300000);
      })
      .catch(function (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}
`;
