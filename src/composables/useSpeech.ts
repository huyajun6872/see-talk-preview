import { ref } from 'vue'

type Lang = 'zh-CN' | 'en-GB'

// 直连小米 MiMo TTS 官方接口（注意：key 会暴露在浏览器，仅适合受信/本地环境）
const MIMO_API_KEY = 'sk-c651f8o4v6gjba3eq56hy74ii5nyf4hpe6d9p6fdpksg4ziy'
const MIMO_URL = 'https://api.xiaomimimo.com/v1/chat/completions'

/** 当前正在朗读的唯一标识（用于高亮） */
export const speakingId = ref<string | null>(null)

/** 循环朗读开关 */
export const loop = ref(false)

/** 云端是否正在生成音频（避免重复点击） */
const cloudBusy = ref(false)

/** 当前正在播放的音频实例，用于停止时真正暂停 */
let currentAudio: HTMLAudioElement | null = null

/** 停止标志：在请求/播放间隙置位，防止异步回来后继续播放 */
let stopped = false

/** 中文用「冰糖」音色，英文用「Mia」音色 */
function voiceForLang(lang: Lang): string {
  return lang === 'zh-CN' ? '冰糖' : 'Mia'
}

/** 直连小米 MiMo，返回音频 blob；失败抛出 */
async function fetchMiMoAudio(text: string, lang: Lang): Promise<Blob> {
  const payload = {
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: '请用自然、亲切的语气朗读以下内容。' },
      { role: 'assistant', content: text },
    ],
    audio: { format: 'mp3', voice: voiceForLang(lang) },
    stream: false,
  }
  const resp = await fetch(MIMO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': MIMO_API_KEY },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error('MiMo http ' + resp.status)
  const data = await resp.json()
  const b64 = data?.choices?.[0]?.message?.audio?.data
  if (!b64) throw new Error('MiMo 响应缺少音频数据')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'audio/mpeg' })
}

/** 云端逐段朗读：请求官方接口播放音频，结束后回调 onDone */
function cloudSpeak(text: string, lang: Lang, id: string, onDone: () => void) {
  if (cloudBusy.value || stopped) return
  cloudBusy.value = true
  speakingId.value = id
  fetchMiMoAudio(text, lang)
    .then((blob) => {
      // 若期间用户点了停止，丢弃这段音频
      if (stopped) {
        cloudBusy.value = false
        onDone()
        return
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
        cloudBusy.value = false
        onDone()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
        cloudBusy.value = false
        onDone()
      }
      const p = audio.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          URL.revokeObjectURL(url)
          if (currentAudio === audio) currentAudio = null
          cloudBusy.value = false
          onDone()
        })
      }
    })
    .catch((e) => {
      console.error('[MiMo] 朗读失败:', e)
      cloudBusy.value = false
      onDone()
    })
}

export function useSpeech() {
  function speak(text: string, lang: Lang, id: string) {
    if (!text) return
    if (speakingId.value === id && cloudBusy.value) {
      stop()
      return
    }
    stopped = false
    cloudSpeak(text, lang, id, () => {
      if (stopped) return
      if (loop.value) {
        speak(text, lang, id)
        return
      }
      if (speakingId.value === id) speakingId.value = null
    })
  }

  const sequencing = ref(false)

  function speakSequence(items: { text: string; lang: Lang; id: string }[]) {
    if (items.length === 0) return
    if (sequencing.value) {
      stop()
      return
    }
    sequencing.value = true
    stopped = false
    let i = 0
    const playNext = () => {
      if (stopped) return
      if (i >= items.length) {
        if (loop.value && !stopped) {
          i = 0
        } else {
          sequencing.value = false
          speakingId.value = null
          return
        }
      }
      const { text, lang, id } = items[i++]
      cloudSpeak(text, lang, id, playNext)
    }
    playNext()
  }

  function stop() {
    stopped = true
    cloudBusy.value = false
    sequencing.value = false
    speakingId.value = null
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      currentAudio = null
    }
  }

  return { speak, speakSequence, stop, sequencing, loop, speakingId, cloudBusy }
}
