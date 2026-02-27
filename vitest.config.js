import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      // Strip ?v=5.0 cache-busting query params from imports
      { find: /^(\..*\.js)\?v=[\d.]+$/, replacement: '$1' },
    ],
  },
  test: {
    root: path.resolve(import.meta.dirname),
  },
});
