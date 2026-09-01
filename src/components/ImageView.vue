<script setup>
import { langOf } from '../utils/lang'

const props = defineProps({
  data: { type: Object, required: true },
  activeId: { type: Number, default: null },
  speakingId: { type: [Number, String], default: null }
})
const emit = defineEmits(['hover', 'leave', 'click'])
</script>

<template>
  <div class="stage" :style="{ aspectRatio: data.width + ' / ' + data.height }">
    <img class="bg" :src="'/images/' + encodeURIComponent(data.image)" :alt="data.image" />
    <!-- 透明可点击热区：点击触发朗读，不遮挡原图文字 -->
    <button
      v-for="t in data.texts"
      :key="t.id"
      type="button"
      class="hot"
      :class="[
        langOf(t.text),
        { active: t.id === activeId, speaking: t.id === speakingId }
      ]"
      :style="{
        left: (t.x * 100) + '%',
        top: (t.y * 100) + '%',
        width: (t.w * 100) + '%',
        height: (t.h * 100) + '%'
      }"
      :title="t.text"
      @mouseenter="emit('hover', t.id)"
      @mouseleave="emit('leave')"
      @click="emit('click', t.id)"
    ></button>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  border: 1px solid #ddd;
  background: #fff;
}
.bg { width: 100%; display: block; }
/* 透明热区：只负责点击/高亮，不显示任何文字，不遮挡原图 */
.hot {
  position: absolute;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s, box-shadow 0.15s;
}
.hot:hover { background: rgba(0, 122, 255, 0.12); }
.hot.active { box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.55) inset; background: rgba(0, 122, 255, 0.1); }
/* 正在朗读的块：醒目高亮 */
.hot.speaking {
  background: rgba(255, 149, 0, 0.28);
  box-shadow: 0 0 0 3px rgba(255, 149, 0, 0.9) inset;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255, 149, 0, 0.9) inset; }
  50% { box-shadow: 0 0 0 5px rgba(255, 149, 0, 0.5) inset; }
}
</style>
