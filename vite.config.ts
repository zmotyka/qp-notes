import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: false, // we use public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB — WebLLM + Mermaid + hljs bundle is large
          // Never cache Firebase Auth or OAuth endpoints — must stay network-only
          navigateFallbackDenylist: [/^\/__/, /\/auth\//],
          runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-woff', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/(huggingface\.co|cdn\.jsdelivr\.net|raw\.githubusercontent\.com)\/.*/i,
            handler: 'NetworkOnly',
          },
            // Firestore and Firebase Auth APIs must always go network-only
            {
              urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    outDir: 'dist',
    // No source maps in production — avoids leaking source code
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-codemirror': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/lang-markdown',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/autocomplete',
          ],
          'vendor-markdown': ['markdown-it', 'highlight.js', 'katex'],
        },
      },
    },
  },
});
