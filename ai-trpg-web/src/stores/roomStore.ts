import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useRoomStore = defineStore('room', () => {
  const roomId = ref<string | null>(null)
  const isHost = ref(false)
  const players = ref<{ id: string; name: string }[]>([])
  const isConnected = ref(false)

  function reset() {
    roomId.value = null
    isHost.value = false
    players.value = []
    isConnected.value = false
  }

  return {
    roomId,
    isHost,
    players,
    isConnected,
    reset,
  }
})
