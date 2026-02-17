import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import AppLayout from '../components/layout/AppLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '首页' } },
      { path: 'scripts', name: 'scripts', component: () => import('../views/ScriptListView.vue'), meta: { title: '剧本管理' } },
      { path: 'lobby', name: 'lobby', component: () => import('../views/LobbyView.vue'), meta: { title: '游戏大厅' } },
      { path: 'occupation', name: 'occupation', component: () => import('../views/OccupationSelectView.vue'), meta: { title: '选择职业' } },
      { path: 'character-create', name: 'character-create', component: () => import('../views/CharacterCreateView.vue'), meta: { title: '创建角色' } },
      { path: 'game', name: 'game', component: () => import('../views/GameRoomView.vue'), meta: { title: '游戏房间' } },
      { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
