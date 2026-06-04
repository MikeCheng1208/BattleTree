<script setup>
import { ref } from 'vue'
import ThemePicker from './ThemePicker.vue'

const props = defineProps({
  canExport: Boolean,
  isFullscreen: Boolean,
  logoSrc: {
    type: String,
    required: true,
  },
  currentTheme: {
    type: String,
    required: true,
  },
  styleThemes: {
    type: Array,
    required: true,
  },
  backgroundImage: {
    type: String,
    default: '',
  },
  backgroundFit: {
    type: String,
    required: true,
  },
  hasCustomLogo: Boolean,
  hasBackgroundImage: Boolean,
})

const emit = defineEmits([
  'add',
  'list',
  'delete',
  'lottery',
  'fullscreen',
  'download',
  'home',
  'set-theme',
  'set-background-fit',
  'set-logo',
  'reset-logo',
  'set-background',
  'reset-background',
])

const isMobileMenuOpen = ref(false)
</script>

<template>
  <nav class="toolbar" :class="{ open: isMobileMenuOpen }" aria-label="工具列">
    <a
      href="#"
      class="toolbar-logo"
      :class="{ 'custom-logo': hasCustomLogo }"
      aria-label="回到首頁"
      @click.prevent="$emit('home')"
    >
      <img :src="logoSrc" alt="" />
    </a>
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
      <ThemePicker
        :current-theme="currentTheme"
        :style-themes="styleThemes"
        :logo-src="logoSrc"
        :background-image="backgroundImage"
        :background-fit="backgroundFit"
        :has-custom-logo="hasCustomLogo"
        :has-background-image="hasBackgroundImage"
        @set-theme="emit('set-theme', $event)"
        @set-background-fit="emit('set-background-fit', $event)"
        @set-logo="emit('set-logo', $event)"
        @reset-logo="emit('reset-logo')"
        @set-background="emit('set-background', $event)"
        @reset-background="emit('reset-background')"
      />
    </div>
  </nav>
</template>
