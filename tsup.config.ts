import { defineConfig } from 'tsup';

export default defineConfig([
  // Node.js builds: stdio + HTTP transports
  {
    entry: {
      index: 'src/index.ts',
      http: 'src/http.ts',
    },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    dts: true,
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    // node-rootly is published without its dist/ directory so it cannot be
    // resolved at runtime. Bundle it directly instead.
    noExternal: ['@wyre-technology/node-rootly'],
  },
  // Cloudflare Worker build — bundle all deps, esnext target, browser runtime
  {
    entry: { worker: 'src/worker.ts' },
    format: ['esm'],
    target: 'esnext',
    platform: 'browser',
    outDir: 'dist',
    clean: false, // append to existing dist
    noExternal: [/.*/], // bundle everything — Workers can't use node_modules
    // node-rootly uses Node.js builtins and won't work in Workers; stub it out
    esbuildOptions(options) {
      options.alias = {
        ...options.alias,
        '@wyre-technology/node-rootly': './src/client.worker-stub.ts',
      };
    },
    sourcemap: true,
    dts: false,
  },
]);
