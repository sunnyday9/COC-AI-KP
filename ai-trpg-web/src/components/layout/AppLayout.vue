<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/', label: '首页', icon: '\u2302' },
  { path: '/scripts', label: '故事', icon: '\u270D' },
  { path: '/game', label: '游戏', icon: '\u2694' },
  { path: '/settings', label: '设置', icon: '\u2699' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-950">
    <!-- Sidebar - desktop -->
    <aside class="hidden md:flex md:flex-col md:w-52 md:fixed md:inset-y-0 border-r border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900 to-eldritch-900/30">
      <!-- Logo -->
      <div class="px-5 py-5 border-b border-gray-800">
        <h1 class="font-serif text-xl font-semibold text-parchment-200 tracking-wider animate-flicker">
          AI COC Keeper
        </h1>
        <p class="text-[10px] text-gray-500 mt-0.5 tracking-widest uppercase">Call of Cthulhu</p>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
          :class="isActive(item.path)
            ? 'bg-eldritch-700/50 text-parchment-200 shadow-eldritch border border-eldritch-600/40'
            : 'text-gray-400 hover:text-parchment-300 hover:bg-gray-800/60'"
        >
          <span class="text-base w-5 text-center">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-gray-800/60 text-[10px] text-gray-600">
        Ph'nglui mglw'nafh Cthulhu
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 flex flex-col md:ml-52 pb-16 md:pb-0 overflow-auto">
      <div class="flex-1">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>

      <!-- Bottom nav - mobile -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 flex bg-gray-900 border-t border-gray-800 z-50">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex-1 flex flex-col items-center justify-center py-2.5 text-xs transition-all duration-200"
          :class="isActive(item.path)
            ? 'text-parchment-200'
            : 'text-gray-500 hover:text-gray-300'"
        >
          <span class="text-lg mb-0.5">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </main>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
