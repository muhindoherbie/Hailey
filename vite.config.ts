import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'] },
      manifest: {
        name: 'Hailey',
        short_name: 'Hailey',
        description: 'Your personal AI assistant, companion and productivity agent.',
        theme_color: '#0f5f58',
        background_color: '#f6f5f1',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Lets Android (and desktop Chrome/Edge) list Hailey in the system Share menu once installed.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{
              name: 'files',
              accept: [
                'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.txt', '.md', '.csv', '.docx', '.xlsx',
              ],
            }],
          },
        } as any,
        shortcuts: [
          { name: 'New chat', url: '/chat/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Tasks', url: '/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Ramble it out', url: '/ramble', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Talk to Hailey', url: '/chat/new?voice=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Discover', url: '/discover', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/ics': { target: 'http://127.0.0.1:8787' },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
