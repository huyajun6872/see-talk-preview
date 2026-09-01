import { ref } from 'vue'

/** 整页音频（原书配套音频）播放状态 */
const src = ref('')
const title = ref('')
const playing = ref(false)
const loading = ref(false)
const error = ref('')
const currentTime = ref(0)
const duration = ref(0)
const ended = ref(false)
/** 已缓冲到的位置（秒），用于进度条显示缓冲区间 */
const bufferedEnd = ref(0)
/** 是否正在等待数据（网络慢导致播放中断） */
const waiting = ref(false)

let audio: HTMLAudioElement | null = null

/** 预取池：存放相邻卡片的静默预加载实例，Url -> Audio */
const prefetchPool = new Map<string, HTMLAudioElement>()
const MAX_PREFETCH = 3

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
    // 关键：auto 让浏览器在加载后立即缓冲整段音频，避免点击播放才开始下载。
    // 原为 'metadata'（仅取元数据），是首播卡顿的主因。
    audio.preload = 'auto'

    audio.onloadedmetadata = () => {
      duration.value = Number.isFinite(audio!.duration) ? audio!.duration : 0
      loading.value = false
    }
    audio.ontimeupdate = () => {
      currentTime.value = audio!.currentTime
    }
    // 缓冲进度
    audio.onprogress = () => {
      const a = audio!
      if (a.buffered.length && Number.isFinite(a.duration) && a.duration > 0) {
        bufferedEnd.value = a.buffered.end(a.buffered.length - 1)
      }
    }
    audio.oncanplay = () => { loading.value = false }
    audio.onwaiting = () => { waiting.value = true }
    audio.onplaying = () => { waiting.value = false; loading.value = false }
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
      waiting.value = false
      error.value = '音频加载失败'
    }
  }
  return audio
}

/**
 * 静默预取音频：只让浏览器把它拉进缓存，不播放。
 * 用于提前缓冲当前卡片的相邻项，切换过去时即可秒播。
 */
function prefetch(url: string) {
  if (!url || prefetchPool.has(url)) return
  if (url === src.value) return // 已在主实例中加载

  // 超出上限时淘汰最早的一个，避免占用过多连接
  if (prefetchPool.size >= MAX_PREFETCH) {
    const oldest = prefetchPool.keys().next().value as string | undefined
    if (oldest) {
      const old = prefetchPool.get(oldest)
      if (old) {
        old.removeAttribute('src')
        old.load()
      }
      prefetchPool.delete(oldest)
    }
  }

  const a = new Audio()
  a.preload = 'auto'
  a.muted = true
  a.src = url
  a.load()
  prefetchPool.set(url, a)
}

/** 清空预取池（切换卡片过频时可调用以释放连接） */
function clearPrefetch() {
  for (const a of prefetchPool.values()) {
    a.removeAttribute('src')
    a.load()
  }
  prefetchPool.clear()
}

export function usePageAudio() {
  /** 切换到指定音频（不自动播放，但会立即开始缓冲） */
  function load(url: string, name = '') {
    detach()
    const a = ensure()
    src.value = url
    title.value = name
    currentTime.value = 0
    duration.value = 0
    bufferedEnd.value = 0
    waiting.value = false
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
    // 若拖到尚未缓冲的位置，给出等待提示
    if (t > bufferedEnd.value) waiting.value = true
  }

  /** 后退 / 前进若干秒 */
  function skip(delta: number) {
    if (!audio) return
    const t = Math.min(Math.max(audio.currentTime + delta, 0), duration.value || 0)
    audio.currentTime = t
    currentTime.value = t
    if (t > bufferedEnd.value) waiting.value = true
  }

  function stop() {
    detach()
    playing.value = false
    loading.value = false
    waiting.value = false
    currentTime.value = 0
    bufferedEnd.value = 0
    ended.value = false
  }

  /**
   * 用户首次交互时调用：解锁音频上下文并预热当前音频，
   * 可显著降低首次点击播放的延迟。
   */
  function warmup() {
    if (!audio || !src.value) return
    // 静音播放一瞬再暂停，触发解码器初始化与缓冲
    const prevMuted = audio.muted
    const prevTime = audio.currentTime
    audio.muted = true
    audio.play()
      .then(() => {
        audio!.pause()
        audio!.currentTime = prevTime
        audio!.muted = prevMuted
      })
      .catch(() => {
        audio!.muted = prevMuted
      })
  }

  return {
    src, title, playing, loading, error, currentTime, duration, ended,
    bufferedEnd, waiting,
    load, play, pause, toggle, replay, seek, skip, stop, warmup,
    prefetch, clearPrefetch
  }
}

function mmss(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export { mmss }
