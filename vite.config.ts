/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// One file configures the bundler and the tests, as in the sibling applications.
// DEMO_BUILD makes a bundle with no Supabase project in it, whatever .env.local says, so the
// smoke test always runs against the local IndexedDB demo and can never reach the real user list.
// It is set by scripts/e2e-smoke.mjs, never by hand.
const demoBuild = !!process.env.DEMO_BUILD;

export default defineConfig({
  plugins: [react()],
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
