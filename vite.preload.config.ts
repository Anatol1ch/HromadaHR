import { defineConfig } from 'vite'

// Sandboxed preload cannot require local modules: emit one CommonJS bundle.
export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: false,
    lib: { entry: 'electron/preload.cts', formats: ['cjs'], fileName: () => 'preload.cjs' },
    rollupOptions: { external: ['electron'] },
  },
})
