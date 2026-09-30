import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { isNative } from './native/platform';
import { installHealthBridge } from './native/health';

// Android app: expose Health Connect before anything asks for a health provider.
if (isNative) installHealthBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: cache the app shell. Skipped in dev so HMR isn't cached, and
// in the Android app, which already ships its files inside the APK.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
