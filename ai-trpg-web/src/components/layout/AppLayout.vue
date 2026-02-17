<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/', label: '首页', icon: '🏠' },
  { path: '/scripts', label: '剧本', icon: '📜' },
  { path: '/lobby', label: '大厅', icon: '🎮' },
  { path: '/game', label: '游戏', icon: '🎲' },
  { path: '/settings', label: '设置', icon: '⚙️' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-100 dark:bg-gray-900">
    <!-- Sidebar - desktop -->
    <aside class="hidden md:flex md:flex-col md:w-48 md:fixed md:inset-y-0 bg-gray-800 dark:bg-gray-950 text-gray-100">
      <div class="p-4 font-bold text-lg border-b border-gray-700">
        AI TRPG
      </div>
      <nav class="flex-1 p-2 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
          :class="isActive(item.path) ? 'bg-gray-600 text-white' : 'hover:bg-gray-700 text-gray-300'"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex-1 flex flex-col md:ml-48 pb-16 md:pb-0 overflow-auto">
      <div class="flex-1">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </div>

      <!-- Bottom nav - mobile -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 flex bg-gray-800 dark:bg-gray-950 text-gray-100 border-t border-gray-700">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors"
          :class="isActive(item.path) ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'"
        >
          <span class="text-lg">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </main>
  </div>
</template>
