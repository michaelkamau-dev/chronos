import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    // Named chunks so test/budget.test.js can hold each one to its own limit.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/skins/')) {
            const m = /\/src\/skins\/([^/]+)\//.exec(id)
            if (m) return `skin-${m[1]}`
          }
          return undefined
        },
      },
    },
  },
})
