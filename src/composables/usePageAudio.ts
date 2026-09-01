import { ref } from 'vue'

/** 整页音频（原书配套 mp3）播放状态 */
const src = ref('')
const title = ref('')
const playing = ref(false)
const loading = ref(false)
const error = ref('')
const currentTime = ref(0)
const duration = ref(0)
const ended = ref(false)

let audio: HTMLAudioElement | null = null

function detach() {
  if (!audio) return
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  audio = null
}

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'metadata'

    audio.onloadedmetadata = () => {
      duration.value = Number.isFinite(audio!.duration) ? audio!.duration : 0
      loading.value = false
    }
    audio.ontimeupdate = () => {
      currentTime.value = audio!.currentTime
    }
    audio.onplay = () => {
      playing.value = true
      ended.value = false
    }
    audio.onpause = () => {
      playing.value = false
    }
    audio.onended = () => {
      playing.value = false
      ended.value = true
      currentTime.value = 0
    }
    audio.onerror = () => {
      loading.value = false
      playing.value = false
      error.value = '音频加载失败'
    }
  }
  return audio
}

export function usePageAudio() {
  /** 切换到指定音频（不自动播放） */
  function load(url: string, name = '') {
    detach()
    const a = ensure()
    src.value = url
    title.value = name
    currentTime.value = 0
    duration.value = 0
    ended.value = false
    error.value = ''
    if (!url) return
    loading.value = true
    a.src = url
    a.load()
  }

  async function play() {
    if (!src.value) return
    error.value = ''
    try {
      await ensure().play()
    } catch (e) {
      playing.value = false
      loading.value = false
      error.value = '播放失败，请再点一次'
    }
  }

  function pause() {
    if (audio) audio.pause()
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  /** 从头重播 */
  function replay() {
    if (!src.value) return
    const a = ensure()
    a.currentTime = 0
    currentTime.value = 0
    a.play().catch(() => {})
  }

  /** 拖动进度（0-1） */
  function seek(ratio: number) {
    if (!audio || !duration.value) return
    const t = Math.min(Math.max(ratio, 0), 1) * duration.value
    audio.currentTime = t
    currentTime.value = t
  }

  /** 后退 / 前进若干秒 */
  function skip(delta: number) {
    if (!audio) return
    const t = Math.min(Math.max(audio.currentTime + delta, 0), duration.value || 0)
    audio.currentTime = t
    currentTime.value = t
  }

  function stop() {
    detach()
    playing.value = false
    loading.value = false
    currentTime.value = 0
    ended.value = false
  }

  return {
    src, title, playing, loading, error, currentTime, duration, ended,
    load, play, pause, toggle, replay, seek, skip, stop
  }
}

/** 供外部（如逐条朗读）通知整页音频让位 */
export function stopPageAudio() {
  stop()
}

function mmss(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export { mmss }
