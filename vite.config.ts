/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// One file configures the bundler and the tests, as in the sibling applications.
// DEMO_BUILD makes a bundle with no Supabase project in it, whatever .env.local says, so the
// smoke test always runs against the local IndexedDB demo and can never reach the real user list.
// It is set by scripts/e2e-smoke.mjs, never by hand.
const demoBuild = !!process.env.DEMO_BUILD;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "autoUpdate", where the sibling stock app uses "prompt". The difference is deliberate:
      // Stock is an offline counting tool and must never reload under somebody mid-count, whereas
      // the portal is a list of links with no in-progress work to lose. A silent update is the
      // right trade here, and it means no "Update app" button cluttering a launcher.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'UEL / Niko Portal',
        short_name: 'UEL Portal',
        description: 'One place to sign in and open any UEL / Niko application.',
        start_url: '/',
        scope: '/',
        theme_color: '#0f4c81',
        background_color: '#0f4c81',
        display: 'standalone',
        orientation: 'any',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell, so the portal opens instantly and survives a bad signal. The tile list
        // itself still comes from Supabase over the network every time - a launcher showing a
        // cached list of applications that has since changed would be worse than a slow one.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // Nothing under these paths is ours to answer for. They are on the Supabase origin rather
        // than this one, so the service worker would not normally see them, but an explicit denial
        // costs nothing and removes the question.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    ...(demoBuild
      ? {
          'import.meta.env.VITE_SUPABASE_URL': '""',
          'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
        }
      : {}),
  },
  build: {
    outDir: demoBuild ? 'dist-e2e' : 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vite 8 bundles with rolldown, which takes groups here rather than rollup's
        // `manualChunks` object - passing the object form fails the build outright.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router)/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
