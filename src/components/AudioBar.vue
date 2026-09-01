<script setup>
import { computed } from 'vue'
import { mmss } from '../composables/usePageAudio'

const props = defineProps({
  title: { type: String, default: '' },
  src: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 }
})
const emit = defineEmits(['toggle', 'replay', 'seek', 'skip'])

const progress = computed(() => {
  if (!props.duration) return 0
  return Math.min(props.currentTime / props.duration, 1) * 100
})

function onSeek(e) {
  emit('seek', Number(e.target.value) / 100)
}
</script>

<template>
  <div class="audiobar">
    <div class="head">
      <span class="label">整页音频</span>
      <span class="name" :title="title">{{ title || '—' }}</span>
      <span v-if="error" class="err">{{ error }}</span>
      <span v-else-if="loading" class="hint">加载中…</span>
      <span v-else class="time">{{ mmss(currentTime) }} / {{ mmss(duration) }}</span>
    </div>

    <div class="row">
      <button class="play" :disabled="!src || loading" @click="emit('toggle')" :title="playing ? '暂停' : '播放'">
        {{ playing ? '❚❚' : '▶' }}
      </button>
      <button class="mini" :disabled="!src" @click="emit('skip', -15)" title="后退 15 秒">↺ 15s</button>
      <button class="mini" :disabled="!src" @click="emit('skip', 15)" title="前进 15 秒">15s ↻</button>
      <button class="mini" :disabled="!src" @click="emit('replay')" title="从头播放">⟲ 重播</button>

      <input
        class="seek"
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="progress"
        :disabled="!duration"
        @input="onSeek"
        aria-label="播放进度"
      />
    </div>
  </div>
</template>

<style scoped>
.audiobar {
  margin-top: 10px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e2e2e2;
  border-radius: 8px;
}
.head {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #666; margin-bottom: 8px; min-width: 0;
}
.label {
  background: #2b8; color: #fff; border-radius: 3px; padding: 1px 6px; flex: 0 0 auto;
}
.name {
  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333;
}
.time { font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.hint { color: #999; flex: 0 0 auto; }
.err { color: #d33; flex: 0 0 auto; }
.row { display: flex; align-items: center; gap: 8px; }
.play {
  width: 38px; height: 34px; border: none; border-radius: 6px;
  background: #ff9500; color: #fff; font-size: 14px; cursor: pointer; flex: 0 0 auto;
}
.play:disabled { opacity: .5; cursor: default; }
.mini {
  height: 30px; padding: 0 9px; border: 1px solid #d5d5d5; border-radius: 6px;
  background: #fafafa; color: #555; font-size: 12px; cursor: pointer; flex: 0 0 auto;
}
.mini:hover:not(:disabled) { background: #f0f5ff; border-color: #7aa7ff; }
.mini:disabled { opacity: .5; cursor: default; }
.seek { flex: 1 1 auto; min-width: 80px; accent-color: #ff9500; cursor: pointer; }
</style>
