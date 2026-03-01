import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    pool: 'threads',
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/logic/**/*.ts', 'src/toolCalling/**/*.ts', 'src/services/kpSessionService.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**'],
    },
  },
})
