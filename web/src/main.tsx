import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/schibsted-grotesk';
import './index.css';
import App from './App';
import { BatchProvider } from './features/batch';
import { initCloud } from './lib/cloud';
import { captureConnectCodeFromUrl } from './lib/helper';
import { isShareRoute } from './lib/share';

const ShareTarget = lazy(() => import('./features/share-target').then((m) => ({ default: m.ShareTarget })));
const SharePage = lazy(() => import('./features/share-page').then((m) => ({ default: m.SharePage })));

const root = createRoot(document.getElementById('root')!);

if (isShareRoute()) {
  // Someone opened a share link: show the shared notes only, without the app or the helper.
  root.render(
    <StrictMode>
      <Suspense fallback={null}>
        <SharePage />
      </Suspense>
    </StrictMode>,
  );
} else if (/^\/(share|add)\/?$/.test(window.location.pathname)) {
  // Opened from the phone's Share menu or an iPhone Shortcut.
  captureConnectCodeFromUrl();
  initCloud();
  root.render(
    <StrictMode>
      <BatchProvider>
        <Suspense fallback={null}>
          <ShareTarget />
        </Suspense>
      </BatchProvider>
    </StrictMode>,
  );
} else {
  captureConnectCodeFromUrl();
  initCloud();
  // The connect link may be opened while the app is already open in this tab.
  window.addEventListener('hashchange', () => {
    if (captureConnectCodeFromUrl()) window.location.reload();
  });
  root.render(
    <StrictMode>
      <BatchProvider>
        <App />
      </BatchProvider>
    </StrictMode>,
  );
}

// Installable app (and offline start) in production.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
