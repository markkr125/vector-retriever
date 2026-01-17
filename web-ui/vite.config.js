import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Auto-inject shared tokens + mixins into every SCSS file.
        // This keeps component SCSS files small and consistent.
        additionalData: [
          '@use "@/scss/base/variables" as *;',
          '@use "@/scss/base/mixins" as *;'
        ].join('\n') + '\n'
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
