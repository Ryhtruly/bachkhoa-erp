import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_BACKEND_TARGET || env.VITE_API_URL || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      exclude: ['**/node_modules/**', '**/.git/**', 'e2e/**'],
    },
    server: {
      watch: {
        usePolling: env.VITE_USE_POLLING === 'true',
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/static': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
