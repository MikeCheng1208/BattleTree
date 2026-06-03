<script setup>
defineProps({
  canExport: Boolean,
  isFullscreen: Boolean,
})

defineEmits(['add', 'list', 'delete', 'lottery', 'fullscreen', 'download'])
</script>

<template>
  <nav class="toolbar" aria-label="工具列">
    <slot name="start"></slot>
    <div class="toolbar-actions">
      <button type="button" @click="$emit('add')">新增</button>
      <button type="button" @click="$emit('list')">選取</button>
      <button type="button" @click="$emit('delete')">刪除</button>
      <button type="button" @click="$emit('lottery')">抽籤</button>
      <button type="button" :disabled="!canExport" @click="$emit('fullscreen')">
        {{ isFullscreen ? '離開全螢幕' : '全螢幕' }}
      </button>
      <button type="button" :disabled="!canExport" @click="$emit('download')">下載 JPG</button>
    </div>
  </nav>
</template>
