<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAudioAnalyser } from '~/composables/useAudioAnalyser'

const { devices, activeDevice, isRunning, error, bands, getDevices, connect, disconnect } = useAudioAnalyser()

const selectedDeviceId = ref<string>('')

onMounted(async () => {
  await getDevices()
  // Auto-select USB Audio CODEC als die er is
  const codec = devices.value.find(d => d.label.toLowerCase().includes('usb audio codec'))
  if (codec) selectedDeviceId.value = codec.deviceId
})

onUnmounted(() => {
  disconnect()
})

async function toggle() {
  if (isRunning.value) {
    await disconnect()
  } else {
    await connect(selectedDeviceId.value || undefined)
  }
}
</script>

<template>
  <main class="w-screen h-screen bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center">

    <!-- Debug: band meters (tijdelijk, wordt straks vervangen door canvas) -->
    <div class="flex flex-col gap-3 items-center">
      <div class="flex gap-8 items-end h-32">
        <div class="flex flex-col items-center gap-1">
          <div
            class="w-6 bg-white/80 rounded-sm transition-none"
            :style="{ height: `${bands.low * 128}px` }"
          />
          <span class="text-white/30 text-[10px] tracking-widest">LOW</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <div
            class="w-6 bg-white/80 rounded-sm transition-none"
            :style="{ height: `${bands.mid * 128}px` }"
          />
          <span class="text-white/30 text-[10px] tracking-widest">MID</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <div
            class="w-6 bg-white/80 rounded-sm transition-none"
            :style="{ height: `${bands.high * 128}px` }"
          />
          <span class="text-white/30 text-[10px] tracking-widest">HIGH</span>
        </div>
      </div>
    </div>

    <!-- Minimal UI overlay — bottom center -->
    <div class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">

      <!-- Device select -->
      <select
        v-model="selectedDeviceId"
        :disabled="isRunning"
        class="bg-white/5 border border-white/10 text-white/50 text-xs rounded px-3 py-1.5 outline-none
               focus:border-white/20 disabled:opacity-30 min-w-48"
      >
        <option value="">Default input</option>
        <option
          v-for="device in devices"
          :key="device.deviceId"
          :value="device.deviceId"
        >
          {{ device.label }}
        </option>
      </select>

      <!-- Status + start/stop -->
      <div class="flex items-center gap-3">
        <!-- Status dot -->
        <span class="flex items-center gap-1.5">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="isRunning ? 'bg-green-400' : 'bg-white/20'"
          />
          <span class="text-white/30 text-[10px] tracking-widest uppercase">
            {{ isRunning ? (activeDevice?.label ?? 'Running') : 'Stopped' }}
          </span>
        </span>

        <!-- Button -->
        <button
          @click="toggle"
          class="text-[10px] tracking-widest uppercase px-4 py-1.5 rounded border transition-colors cursor-pointer
                 border-white/20 text-white/50 hover:border-white/40 hover:text-white/80"
        >
          {{ isRunning ? 'Stop' : 'Start' }}
        </button>
      </div>

      <!-- Error -->
      <p v-if="error" class="text-red-400/70 text-[10px]">{{ error }}</p>
    </div>

  </main>
</template>
