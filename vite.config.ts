import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    /*
     * No asset inlining.
     *
     * The default 4KB threshold silently base64s a small font into the stylesheet,
     * which is wrong twice over: it makes the font a render-blocking part of the CSS
     * instead of something the browser fetches only when text actually uses the face,
     * and it hides the bytes from the per-class font budget in test/budget.test.js.
     * Windows 3.1's subset is 3KB and was being inlined; that is exactly the case
     * this guards.
     */
    assetsInlineLimit: 0,
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
