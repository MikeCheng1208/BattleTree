<script setup>
import { ref } from 'vue'

defineProps({
  canExport: Boolean,
  isFullscreen: Boolean,
})

defineEmits(['add', 'list', 'delete', 'lottery', 'fullscreen', 'download'])

const isMobileMenuOpen = ref(false)
</script>

<template>
  <nav class="toolbar" :class="{ open: isMobileMenuOpen }" aria-label="工具列">
    <slot name="start"></slot>
    <button
      type="button"
      class="toolbar-menu-toggle"
      :aria-expanded="isMobileMenuOpen"
      aria-label="切換工具列"
      @click="isMobileMenuOpen = !isMobileMenuOpen"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div class="toolbar-actions">
      <button type="button" @click="$emit('add')">新增</button>
      <button type="button" @click="$emit('list')">選取</button>
      <button type="button" @click="$emit('delete')">刪除</button>
      <button type="button" @click="$emit('lottery')">抽籤</button>
      <button
        type="button"
        class="fullscreen-action"
        :disabled="!canExport"
        @click="$emit('fullscreen')"
      >
        {{ isFullscreen ? '離開全螢幕' : '全螢幕' }}
      </button>
      <button type="button" :disabled="!canExport" @click="$emit('download')">
        下載<span class="desktop-label"> JPG</span>
      </button>
    </div>
  </nav>
</template>
