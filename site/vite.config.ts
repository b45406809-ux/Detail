import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';

const siteRoot = new URL('.', import.meta.url);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-mobile-favicon',
      closeBundle() {
        copyFileSync(new URL('../mobile/assets/favicon.png', siteRoot), new URL('dist/favicon.png', siteRoot));
      },
    },
  ],
  build: {
    target: 'es2022',
    cssMinify: true,
    rollupOptions: {
      input: [new URL('./index.html', import.meta.url).pathname, new URL('./dashboard.html', import.meta.url).pathname],
    },
  },
});
