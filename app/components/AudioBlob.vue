<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { AudioBands } from '~/composables/useAudioAnalyser'

const props = defineProps<{
  bands: AudioBands
  isRunning: boolean
}>()

// ─── Canvas setup ────────────────────────────────────────────────────────────

const canvasEl = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let animFrameId: number | null = null
let resizeObserver: ResizeObserver | null = null

// ─── Smooth state — lerp de bands nog een keer voor de visual layer ──────────
// De composable smoother is voor het oppikken van audio.
// Hier een extra, langzamere smooth voor de render — voor 'heavy' gevoel.

const smooth = {
  low: 0,
  mid: 0,
  high: 0,
}

// Render-specifieke smoothing — lager = meer slug, hoger = sneller
const RENDER_SMOOTH = 0.08

// ─── Animatie state ──────────────────────────────────────────────────────────

// Meerdere "golven" die onafhankelijk door de blob lopen.
// Elke golf heeft een eigen snelheid en amplitude.
const waves = [
  { freq: 3, speed: 0.003, amp: 1.0, phase: 0 },  // langzame primaire golf
  { freq: 5, speed: 0.007, amp: 0.5, phase: 2.1 }, // medium
  { freq: 7, speed: 0.011, amp: 0.3, phase: 4.3 }, // snelle subtiele golf
  { freq: 2, speed: 0.002, amp: 0.8, phase: 1.0 }, // hele trage brede golf
]

let time = 0

// ─── Blob rendering ──────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function drawBlob(width: number, height: number): void {
  if (!ctx) return

  const cx = width / 2
  const cy = height / 2
  const baseRadius = Math.min(width, height) * 0.22

  // Smooth de bands in de render laag
  smooth.low  = lerp(smooth.low,  props.bands.low,  RENDER_SMOOTH)
  smooth.mid  = lerp(smooth.mid,  props.bands.mid,  RENDER_SMOOTH)
  smooth.high = lerp(smooth.high, props.bands.high, RENDER_SMOOTH)

  // Schaal door bass: 1.0 (stil) → 1.25 (luid)
  const scale = 1 + smooth.low * 0.25

  // Wobble door mids: hoeveel de golven de radius vervormen
  const wobbleMag = smooth.mid * baseRadius * 0.35

  // Micro-trilling door highs: snelle kleine rimpels
  const highFreq = 12
  const highAmp  = smooth.high * baseRadius * 0.08

  // Aantal punten rondom de blob
  const N = 256
  const points: [number, number][] = []

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2

    // Basis radius + schaal van bass
    let r = baseRadius * scale

    // Mids: meerdere golven opgeteld
    for (const wave of waves) {
      r += Math.sin(wave.freq * angle + wave.phase) * wobbleMag * wave.amp
    }

    // Highs: snelle micro-rimpels
    r += Math.sin(highFreq * angle + time * 0.04) * highAmp

    points.push([
      cx + Math.cos(angle) * r,
      cy + Math.sin(angle) * r,
    ])
  }

  // ─── Teken de blob via smooth gesloten curve ────────────────────────────
  // Techniek: midpoints als ankerpunten, originele punten als control points
  // → perfect smooth closed curve, geen hoeken

  ctx.beginPath()

  for (let i = 0; i < N; i++) {
    const cur  = points[i]!
    const next = points[(i + 1) % N]!
    const mx   = (cur[0] + next[0]) / 2
    const my   = (cur[1] + next[1]) / 2

    if (i === 0) {
      ctx.moveTo(mx, my)
    } else {
      ctx.quadraticCurveTo(cur[0], cur[1], mx, my)
    }
  }

  // Sluit de curve
  const first = points[0]!
  const last  = points[N - 1]!
  ctx.quadraticCurveTo(
    last[0], last[1],
    (last[0] + first[0]) / 2,
    (last[1] + first[1]) / 2,
  )

  ctx.closePath()

  // ─── Fill ───────────────────────────────────────────────────────────────
  // Simpel wit voor nu — stap 5 wordt kleur en glow
  ctx.fillStyle = 'rgba(240, 238, 232, 0.92)'
  ctx.fill()
}

// ─── Render loop ─────────────────────────────────────────────────────────────

function frame(): void {
  if (!ctx || !canvasEl.value) return

  const { width, height } = canvasEl.value

  // Background: niet hard wissen maar faden → lichte trail
  // Hoe hoger de alpha, hoe sneller het vervaagt (minder trail)
  ctx.fillStyle = 'rgba(10, 10, 10, 0.4)'
  ctx.fillRect(0, 0, width, height)

  drawBlob(width, height)

  // Fase optellen → golven "bewegen"
  for (const wave of waves) {
    wave.phase += wave.speed
  }
  time++

  animFrameId = requestAnimationFrame(frame)
}

function startLoop(): void {
  if (animFrameId !== null) return
  frame()
}

function stopLoop(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
}

// ─── Canvas resize ────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  if (!canvasEl.value) return
  canvasEl.value.width  = window.innerWidth
  canvasEl.value.height = window.innerHeight
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  const canvas = canvasEl.value
  if (!canvas) return

  ctx = canvas.getContext('2d')
  resizeCanvas()

  resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(document.documentElement)

  // Altijd renderen — ook als audio nog niet loopt (statische blob)
  startLoop()
})

onUnmounted(() => {
  stopLoop()
  resizeObserver?.disconnect()
})
</script>

<template>
  <canvas
    ref="canvasEl"
    class="absolute inset-0 w-full h-full"
  />
</template>
