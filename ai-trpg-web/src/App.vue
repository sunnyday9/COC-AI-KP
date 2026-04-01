<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from './stores/settingsStore'
import { useDebugStore } from './stores/debugStore'
import ToastContainer from './components/ui/ToastContainer.vue'

const settingsStore = useSettingsStore()
const debugStore = useDebugStore()

onMounted(async () => {
  await settingsStore.load()
  if (settingsStore.debugMode || import.meta.env.DEV) {
    debugStore.setEnabled(true)
  }
})
</script>

<template>
  <router-view />
  <ToastContainer />
</template>
