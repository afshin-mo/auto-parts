import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** sw/sw.js را با فهرست فایل‌های همین بیلد پر می‌کند و در ریشه‌ی خروجی می‌گذارد (بدون وابستگی اضافه) */
function swPrecache(): Plugin {
  return {
    name: 'sw-precache',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map')).sort();
      const urls = [...new Set(['/index.html', '/manifest.webmanifest', '/favicon.svg', ...files.map((f) => '/' + f)])];
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      const source = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8').replaceAll('__VERSION__', version).replaceAll('__PRECACHE__', JSON.stringify(urls));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), swPrecache()],
    server: {
      port: 5173,
      // در حالت عادی درخواست‌های /api به بکند Nest (پورت ۳۰۰۰) هدایت می‌شود
      proxy: { '/api': { target: env.VITE_API_PROXY || 'http://localhost:3000', changeOrigin: true } },
    },
  };
});
