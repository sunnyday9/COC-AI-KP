import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Electron loads the app via file:// in production, so assets must be relative.
  base: './',
})
