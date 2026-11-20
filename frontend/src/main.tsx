import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/lalezar/arabic-400.css';
import './styles/global.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { UiProvider } from './components/ui';

// نسخه‌ی production برای بازشدن بدون اینترنت پوسته را کش می‌کند (حالت mock و توسعه ندارد)
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_MOCK !== 'true') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* بدون SW هم برنامه کار می‌کند */ }); });
}

// بعد از دیپلوی نسخه‌ی تازه، chunk‌های نسخه‌ی قبلی پاک می‌شوند؛ یک بار صفحه را تازه می‌کنیم (نه بی‌نهایت، اگر سرور واقعاً در دسترس نیست)
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('chunkReloadAt') ?? 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem('chunkReloadAt', String(Date.now()));
  window.location.reload();
});

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 15_000 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <UiProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
