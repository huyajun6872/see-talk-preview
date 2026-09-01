<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import ImageView from './components/ImageView.vue'
import TextList from './components/TextList.vue'
import AudioBar from './components/AudioBar.vue'
import { useSpeech, speakingId } from './composables/useSpeech.ts'
import { usePageAudio } from './composables/usePageAudio.ts'
import { langOf } from './utils/lang'

const { speak, speakSequence, stop, sequencing, loop } = useSpeech()
const pageAudio = usePageAudio()

const files = ref([])
const current = ref(null)
const data = ref(null)
const activeId = ref(null)
const loading = ref(false)

// 文本 -> MiMo 语言标签
function toLang(text) {
  return langOf(text) === 'zh' ? 'zh-CN' : 'en-GB'
}

const base = import.meta.env.BASE_URL

/** 由 index 项得到可直接请求的音频 URL（只编码文件名，保留目录分隔符） */
function audioUrl(item) {
  const name = String(item?.audio || '').split('/').pop()
  return name ? base + 'audio/' + encodeURIComponent(name) : ''
}

/** 预取相邻卡片的音频，切换过去时可立即播放 */
function prefetchNeighbors(f) {
  const i = files.value.findIndex(x => x.file === f.file)
  if (i < 0) return
  // 优先下一张（更可能被访问），其次上一张
  const next = files.value[i + 1]
  const prev = files.value[i - 1]
  if (next) pageAudio.prefetch(audioUrl(next))
  if (prev) pageAudio.prefetch(audioUrl(prev))
}

onMounted(async () => {
  const res = await fetch(base + 'data/index.json')
  files.value = await res.json()
  if (files.value.length) select(files.value[0])

  // 首次交互时预热当前音频（解锁播放并触发缓冲），降低首播延迟
  const warm = () => {
    pageAudio.warmup()
    window.removeEventListener('pointerdown', warm)
    window.removeEventListener('keydown', warm)
  }
  window.addEventListener('pointerdown', warm, { once: false })
  window.addEventListener('keydown', warm, { once: false })
})

async function select(f) {
  current.value = f
  loading.value = true
  activeId.value = null
  stop()
  // 切换到该卡片对应的音频：preload=auto 会立即开始缓冲整段
  pageAudio.load(audioUrl(f), f.title)
  // 数据请求返回后再预取相邻项，避免与当前音频争抢带宽
  const res = await fetch(base + 'data/' + encodeURIComponent(f.file))
  data.value = await res.json()
  loading.value = false
  setTimeout(() => prefetchNeighbors(f), 800)
}

function onActivate(id) {
  const t = data.value?.texts.find(x => x.id === id)
  if (!t) return
  activeId.value = id
  pageAudio.pause()   // 逐条朗读与整页音频互斥
  speak(t.text, toLang(t.text), id)
}

function playAll() {
  if (!data.value) return
  stop()
  pageAudio.pause()
  const items = data.value.texts.map(t => ({ text: t.text, lang: toLang(t.text), id: t.id }))
  speakSequence(items)
}

// 播放整页音频时，停止逐条朗读
function onPageToggle() {
  if (!pageAudio.playing.value) stop()
  pageAudio.toggle()
}

function setActive(id) { activeId.value = id }
function clearActive() { activeId.value = null }

const zhCount = computed(() => data.value?.texts.filter(t => langOf(t.text) === 'zh').length ?? 0)
const enCount = computed(() => (data.value?.texts.length ?? 0) - zhCount.value)

watch(current, () => { window.scrollTo(0, 0) })
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">图文 OCR · 点击朗读预览</div>
      <div class="picker">
        <label>选择图片：</label>
        <select :value="current?.file" @change="select(files.find(f => f.file === $event.target.value))">
          <option v-for="f in files" :key="f.file" :value="f.file">{{ f.title }}</option>
        </select>
      </div>
      <div class="meta" v-if="data">
        共 <b>{{ data.texts.length }}</b> 块（中 {{ zhCount }} / 英 {{ enCount }}）
        · 原图 {{ data.width }}×{{ data.height }}
      </div>
      <div class="actions">
        <button class="btn" :disabled="!data" @click="playAll">
          {{ sequencing ? '连读中…' : '▶ 连读全部' }}
        </button>
        <button class="btn ghost" @click="stop">■ 停止</button>
        <label class="loop">
          <input type="checkbox" v-model="loop" /> 循环
        </label>
      </div>
    </header>

    <p class="tip">
      下方「整页音频」是本页配套原声；点击图片或列表条目可逐条朗读（中文用「冰糖」、英文用「Mia」音色）。两者互斥。
    </p>

    <main class="content" v-if="data && !loading">
      <section class="left">
        <ImageView
          :data="data"
          :active-id="activeId"
          :speaking-id="speakingId"
          @hover="setActive"
          @leave="clearActive"
          @click="onActivate"
        />
        <AudioBar
          v-if="current?.audio"
          :title="pageAudio.title.value"
          :src="pageAudio.src.value"
          :playing="pageAudio.playing.value"
          :loading="pageAudio.loading.value"
          :waiting="pageAudio.waiting.value"
          :error="pageAudio.error.value"
          :current-time="pageAudio.currentTime.value"
          :buffered-end="pageAudio.bufferedEnd.value"
          :duration="pageAudio.duration.value"
          @toggle="onPageToggle"
          @replay="pageAudio.replay"
          @seek="pageAudio.seek"
          @skip="pageAudio.skip"
        />
      </section>
      <aside class="right">
        <TextList
          :texts="data.texts"
          :active-id="activeId"
          :speaking-id="speakingId"
          @hover="setActive"
          @leave="clearActive"
          @click="onActivate"
        />
      </aside>
    </main>
    <div class="loading" v-else>加载中…</div>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; }
.topbar {
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  padding: 12px 20px; background: #1f2330; color: #fff;
}
.brand { font-size: 16px; font-weight: 700; }
.picker label { font-size: 13px; color: #bbb; }
.picker select { font-size: 14px; padding: 6px 10px; border-radius: 6px; border: none; min-width: 220px; }
.meta { font-size: 13px; color: #cfd2dc; }
.meta b { color: #ffd479; }
.actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.btn {
  font-size: 13px; padding: 6px 12px; border-radius: 6px; border: none;
  background: #ff9500; color: #fff; cursor: pointer;
}
.btn:disabled { opacity: .6; cursor: default; }
.btn.ghost { background: #555c70; }
.loop { font-size: 13px; color: #cfd2dc; display: flex; align-items: center; gap: 4px; }
.tip { padding: 10px 20px 0; color: #666; font-size: 13px; margin: 0; }
.content {
  display: flex; gap: 24px; padding: 16px 20px 40px; align-items: flex-start; flex-wrap: wrap;
}
.left { width: 560px; max-width: 100%; flex: 0 0 auto; }
.right { width: 460px; max-width: 100%; flex: 1 1 360px; }
.loading { padding: 60px; text-align: center; color: #888; }
</style>
