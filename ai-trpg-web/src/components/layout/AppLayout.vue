<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/', label: '首页', icon: '⛧' },
  { path: '/scripts', label: '故事', icon: '📜' },
  { path: '/game', label: '游戏', icon: '🗡' },
  { path: '/settings', label: '设置', icon: '⚙' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-void">
    <!-- Sidebar - desktop -->
    <aside class="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0
                   border-r border-slate bg-gradient-to-b from-abyss via-abyss to-obsidian">
      <!-- Logo area with decorative borders -->
      <div class="px-5 py-5 border-b border-slate relative overflow-hidden">
        <!-- Decorative corner ornaments -->
        <div class="absolute top-0 left-0 w-8 h-8 border-t border-l border-eldritch-700/30" />
        <div class="absolute top-0 right-0 w-8 h-8 border-t border-r border-eldritch-700/30" />
        <div class="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-eldritch-700/30" />
        <div class="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-eldritch-700/30" />

        <h1 class="font-display text-xl font-bold tracking-widest animate-flicker relative z-10"
            style="color: hsl(38, 50%, 88%); text-shadow: 0 0 20px hsla(165, 60%, 35%, 0.2);">
          AI COC Keeper
        </h1>
        <p class="text-[10px] mt-1 tracking-[0.25em] uppercase relative z-10"
           style="color: hsl(220, 10%, 30%);">
          Call of Cthulhu
        </p>
        <!-- Subtle eldritch line -->
        <div class="mt-2 ink-divider" />
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                 transition-all duration-300 relative"
          :class="isActive(item.path)
            ? 'text-eldritch-100 bg-eldritch-mist'
            : 'text-fog hover:text-parchment-300 hover:bg-obsidian/60'"
        >
          <!-- Active indicator — glowing left bar -->
          <div v-if="isActive(item.path)"
               class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-eldritch-400
                      shadow-[0_0_8px_hsla(165,60%,35%,0.5)]" />
          <span class="text-base w-5 text-center">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- Footer — Lovecraftian quote -->
      <div class="px-5 py-3 border-t border-slate/40">
        <p class="text-[9px] italic font-serif leading-relaxed"
           style="color: hsl(220, 10%, 25%);">
          Ph'nglui mglw'nafh Cthulhu R'lyeh wgah'nagl fhtagn
        </p>
        <!-- Decorative tentacle-like SVG -->
        <svg class="mt-2 w-full h-4 opacity-10" viewBox="0 0 200 16" fill="none" stroke="currentColor"
             style="color: hsl(165, 60%, 35%);">
          <path d="M0 8 C30 2, 50 14, 80 8 S130 2, 160 8 S190 14, 200 8"
                stroke-width="1" opacity="0.6"/>
          <path d="M0 10 C40 4, 60 16, 100 10 S140 4, 180 10 S195 16, 200 10"
                stroke-width="0.5" opacity="0.4"/>
        </svg>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 flex flex-col md:ml-60 pb-16 md:pb-0 overflow-auto">
      <div class="flex-1">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>

      <!-- Bottom nav - mobile (frosted glass) -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 flex z-50 border-t border-slate/60"
           style="background: hsla(220, 18%, 7%, 0.85); backdrop-filter: blur(12px);">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex-1 flex flex-col items-center justify-center py-2.5 text-xs
                 transition-all duration-300 relative"
          :class="isActive(item.path)
            ? 'text-eldritch-300'
            : 'text-fog hover:text-parchment-400'"
        >
          <!-- Active dot -->
          <div v-if="isActive(item.path)"
               class="absolute top-1 w-1 h-1 rounded-full bg-eldritch-400
                      shadow-[0_0_6px_hsla(165,60%,35%,0.6)]" />
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
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
