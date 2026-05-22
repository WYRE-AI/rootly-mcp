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
    // Bundle node-rootly directly — the npm package is published without dist/
    // so we cannot rely on it being resolvable at runtime.
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
