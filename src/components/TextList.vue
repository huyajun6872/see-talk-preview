<script setup>
import { langOf } from '../utils/lang'

const props = defineProps({
  texts: { type: Array, required: true },
  activeId: { type: Number, default: null },
  speakingId: { type: [Number, String], default: null }
})
const emit = defineEmits(['hover', 'leave', 'click'])
</script>

<template>
  <div class="list">
    <button
      v-for="t in texts"
      :key="t.id"
      type="button"
      class="item"
      :class="[langOf(t.text), { active: t.id === activeId, speaking: t.id === speakingId }]"
      @mouseenter="emit('hover', t.id)"
      @mouseleave="emit('leave')"
      @click="emit('click', t.id)"
    >
      <span class="num">{{ t.id }}</span>
      <span class="tag">{{ langOf(t.text) === 'zh' ? '中' : '英' }}</span>
      <span class="txt">{{ t.text }}</span>
      <span v-if="t.low_conf" class="warn" title="低置信度，建议人工核对">!</span>
      <span v-if="t.id === speakingId" class="wave" aria-hidden="true">🔊</span>
    </button>
    <p v-if="!texts.length" class="empty">该图片未识别到文本</p>
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 6px; }
.item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #ececec;
  border-left: 4px solid #bbb;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, box-shadow 0.15s;
  width: 100%;
}
.item.zh { border-left-color: #e67; }
.item.en { border-left-color: #2b8; }
.item:hover { background: #f0f5ff; }
.item.active { background: #eaf2ff; box-shadow: 0 0 0 1px #7aa7ff; }
.item.speaking { background: #fff4e0; box-shadow: 0 0 0 2px #ff9500; }
.num { font-weight: 700; color: #333; }
.tag { font-size: 11px; color: #fff; background: #999; border-radius: 3px; padding: 0 4px; }
.item.zh .tag { background: #e67; }
.item.en .tag { background: #2b8; }
.txt { flex: 1; color: #222; }
.warn {
  color: #fff; background: #e90; border-radius: 50%;
  width: 16px; height: 16px; font-size: 11px; line-height: 16px; text-align: center; flex: 0 0 auto;
}
.wave { flex: 0 0 auto; }
.empty { color: #999; font-size: 13px; }
</style>
