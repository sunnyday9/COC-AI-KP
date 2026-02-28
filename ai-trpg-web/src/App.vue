<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from './stores/settingsStore'
import ToastContainer from './components/ui/ToastContainer.vue'

const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.load()
})
</script>

<template>
  <router-view />
  <ToastContainer />
</template>
