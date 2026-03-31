import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import AppLayout from '../components/layout/AppLayout.vue'
import { useGameStore } from '../stores/gameStore'

const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [{ path: 'rag-inspector', name: 'rag-inspector', component: () => import('../views/RagInspectorView.vue'), meta: { title: 'RAG Inspector' } }]
  : []

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '首页' } },
      { path: 'scripts', name: 'scripts', component: () => import('../views/ScriptListView.vue'), meta: { title: '故事管理' } },
      { path: 'occupation', name: 'occupation', component: () => import('../views/OccupationSelectView.vue'), meta: { title: '选择职业' } },
      { path: 'character-create', name: 'character-create', component: () => import('../views/CharacterCreateView.vue'), meta: { title: '创建角色' } },
      { path: 'game', name: 'game', component: () => import('../views/GameRoomView.vue'), meta: { title: '游戏房间', requiresGame: true } },
      { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } },
      ...devRoutes,
    ],
  },
]

const router = createRouter({
  history: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? createWebHashHistory()
    : createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  if (to.meta.requiresGame && to.name === 'game') {
    const gameStore = useGameStore()
    if (gameStore.gamePhase !== 'playing' || !gameStore.characterSheet) {
      return { path: '/', replace: true }
    }
  }
})

export default router
