<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from './stores/settingsStore'

const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.load()
})
</script>

<template>
  <router-view />
</template>
