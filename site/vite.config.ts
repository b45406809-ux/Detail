import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-mobile-favicon',
      closeBundle() {
        copyFileSync(resolve(siteRoot, '../mobile/assets/favicon.png'), resolve(siteRoot, 'dist/favicon.png'));
      },
    },
  ],
  build: { target: 'es2022', cssMinify: true, rollupOptions: { input: { main: resolve(siteRoot, 'index.html'), dashboard: resolve(siteRoot, 'dashboard.html') } } },
});
