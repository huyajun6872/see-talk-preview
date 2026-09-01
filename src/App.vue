<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import ImageView from './components/ImageView.vue'
import TextList from './components/TextList.vue'
import { useSpeech, speakingId } from './composables/useSpeech.ts'
import { langOf } from './utils/lang'

const { speak, speakSequence, stop, sequencing, loop } = useSpeech()

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

onMounted(async () => {
  const res = await fetch(base + 'data/index.json')
  files.value = await res.json()
  if (files.value.length) select(files.value[0])
})

async function select(f) {
  current.value = f
  loading.value = true
  activeId.value = null
  stop()
  const res = await fetch(base + 'data/' + encodeURIComponent(f.file))
  data.value = await res.json()
  loading.value = false
}

function onActivate(id) {
  const t = data.value?.texts.find(x => x.id === id)
  if (!t) return
  activeId.value = id
  speak(t.text, toLang(t.text), id)
}

function playAll() {
  if (!data.value) return
  stop()
  const items = data.value.texts.map(t => ({ text: t.text, lang: toLang(t.text), id: t.id }))
  speakSequence(items)
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

    <p class="tip">点击图片上的透明区域或下方列表条目即可朗读；中文用「冰糖」、英文用「Mia」音色。</p>

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
