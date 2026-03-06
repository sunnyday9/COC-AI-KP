import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    pool: 'threads',
    include: [
      'src/**/*.{spec,test}.{ts,tsx}',
      'electron/**/*.{spec,test}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/logic/**/*.ts',
        'src/toolCalling/**/*.ts',
        'src/services/kpSessionService.ts',
        'src/services/memoryService.ts',
        'src/stores/gameStore.ts',
        'electron/agent/kpGraph.mjs',
        'electron/rag/vectorStore.mjs',
        'electron/rag/embedding.mjs',
      ],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**'],
    },
  },
})
