import { ref, readonly } from 'vue'

export type AudioBands = {
  low: number   // bass: 20–250 Hz  → schaal / "ademhaling"
  mid: number   // mids: 250–4000 Hz → vorm vervorming
  high: number  // highs: 4000–16000 Hz → glow / detail
}

export type AudioDevice = {
  deviceId: string
  label: string
}

// Lerp voor smooth transitions — gebruik een lage factor (0.1–0.2) voor vloeiend gedrag
function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

// Gemiddelde van een slice van de FFT data, genormaliseerd naar 0–1
function bandAverage(data: Uint8Array, fromIndex: number, toIndex: number): number {
  let sum = 0
  const count = toIndex - fromIndex
  for (let i = fromIndex; i < toIndex; i++) {
    sum += data[i]!
  }
  return sum / (count * 255)
}

export function useAudioAnalyser() {
  // State
  const devices = ref<AudioDevice[]>([])
  const activeDevice = ref<AudioDevice | null>(null)
  const isRunning = ref(false)
  const error = ref<string | null>(null)

  // Audio bands — smooth, realtime
  const bands = ref<AudioBands>({ low: 0, mid: 0, high: 0 })

  // Internals
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let stream: MediaStream | null = null
  let animFrameId: number | null = null
  let fftData: Uint8Array | null = null

  // Smoothing factor — lager = trager/vloeiender, hoger = sneller/directer
  const SMOOTH = 0.15

  // Frequentie → FFT bin index
  // binIndex = freq / (sampleRate / fftSize)
  function freqToBin(freq: number, sampleRate: number, fftSize: number): number {
    return Math.round(freq / (sampleRate / fftSize))
  }

  async function getDevices(): Promise<void> {
    // Trigger permission request zodat labels zichtbaar worden
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach(t => t.stop())
    } catch {
      // Permission denied of geen device — toon toch wat er is
    }

    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all
      .filter(d => d.kind === 'audioinput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)})`,
      }))
  }

  async function connect(deviceId?: string): Promise<void> {
    if (isRunning.value) await disconnect()
    error.value = null

    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      }

      stream = await navigator.mediaDevices.getUserMedia(constraints)

      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0   // wij doen eigen smoothing
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      fftData = new Uint8Array(analyser.frequencyBinCount)

      // Resolve welk device actief is
      const trackLabel = stream.getAudioTracks()[0]?.label ?? ''
      activeDevice.value =
        devices.value.find(d => d.deviceId === deviceId) ??
        devices.value.find(d => d.label === trackLabel) ??
        { deviceId: deviceId ?? 'default', label: trackLabel || 'Unknown' }

      isRunning.value = true
      tick()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Audio connection failed'
    }
  }

  async function disconnect(): Promise<void> {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    source?.disconnect()
    stream?.getTracks().forEach(t => t.stop())
    await audioContext?.close()

    source = null
    stream = null
    audioContext = null
    analyser = null
    fftData = null

    isRunning.value = false
    activeDevice.value = null
    bands.value = { low: 0, mid: 0, high: 0 }
  }

  function tick(): void {
    if (!analyser || !fftData) return

    analyser.getByteFrequencyData(fftData)

    const sampleRate = audioContext!.sampleRate
    const fftSize = analyser.fftSize

    // Band grenzen in Hz
    const lowFrom  = freqToBin(20,    sampleRate, fftSize)
    const lowTo    = freqToBin(250,   sampleRate, fftSize)
    const midFrom  = freqToBin(250,   sampleRate, fftSize)
    const midTo    = freqToBin(4000,  sampleRate, fftSize)
    const highFrom = freqToBin(4000,  sampleRate, fftSize)
    const highTo   = freqToBin(16000, sampleRate, fftSize)

    const rawLow  = bandAverage(fftData, lowFrom,  lowTo)
    const rawMid  = bandAverage(fftData, midFrom,  midTo)
    const rawHigh = bandAverage(fftData, highFrom, highTo)

    // Smooth toepassen
    bands.value = {
      low:  lerp(bands.value.low,  rawLow,  SMOOTH),
      mid:  lerp(bands.value.mid,  rawMid,  SMOOTH),
      high: lerp(bands.value.high, rawHigh, SMOOTH),
    }

    animFrameId = requestAnimationFrame(tick)
  }

  return {
    // State (readonly buiten composable)
    devices: readonly(devices),
    activeDevice: readonly(activeDevice),
    isRunning: readonly(isRunning),
    error: readonly(error),
    bands: readonly(bands),

    // Actions
    getDevices,
    connect,
    disconnect,
  }
}
