<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  currentTheme: {
    type: String,
    required: true,
  },
  styleThemes: {
    type: Array,
    required: true,
  },
  logoSrc: {
    type: String,
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

const emit = defineEmits(['set-theme', 'set-background-fit', 'set-logo', 'reset-logo', 'set-background', 'reset-background'])

const LOGO_MAX_SIZE = 2 * 1024 * 1024
const BACKGROUND_MAX_SIZE = 6 * 1024 * 1024
const backgroundFitOptions = [
  { value: 'contain', label: '完整' },
  { value: 'cover-center', label: '填滿' },
  { value: 'cover-top', label: '靠上' },
  { value: 'actual', label: '原始' },
]
const isThemeModalOpen = ref(false)
const logoInputRef = ref(null)
const backgroundInputRef = ref(null)
const logoError = ref('')
const backgroundError = ref('')
const logoPreview = ref('')
const backgroundPreview = ref('')
const activeSwatches = computed(
  () => props.styleThemes.find((theme) => theme.value === props.currentTheme)?.swatches ?? props.styleThemes[0]?.swatches ?? [],
)
const visibleLogo = computed(() => logoPreview.value || props.logoSrc)
const visibleBackground = computed(() => backgroundPreview.value || props.backgroundImage)
const backgroundPreviewStyle = computed(() => {
  if (!visibleBackground.value) return undefined
  if (props.backgroundFit === 'contain') {
    return {
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.26), rgba(0, 0, 0, 0.26)), url(${visibleBackground.value}), url(${visibleBackground.value})`,
      backgroundPosition: 'center center, center center, center center',
      backgroundSize: 'contain, contain, cover',
      backgroundRepeat: 'no-repeat',
    }
  }
  const styles = {
    contain: { size: 'contain', position: 'center' },
    'cover-center': { size: 'cover', position: 'center' },
    'cover-top': { size: 'cover', position: 'top center' },
    actual: { size: 'auto', position: 'center' },
  }
  const fitStyle = styles[props.backgroundFit] ?? styles['cover-center']
  return {
    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.38)), url(${visibleBackground.value})`,
    backgroundPosition: fitStyle.position,
    backgroundSize: fitStyle.size,
    backgroundRepeat: 'no-repeat',
  }
})

function chooseTheme(theme) {
  emit('set-theme', theme)
}

function formatFileSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function replacePreview(target, file) {
  if (target.value) URL.revokeObjectURL(target.value)
  target.value = URL.createObjectURL(file)
}

function clearPreview(target) {
  if (target.value) URL.revokeObjectURL(target.value)
  target.value = ''
}

function getUploadConfig(type) {
  if (type === 'logo') {
    return {
      emitName: 'set-logo',
      maxSize: LOGO_MAX_SIZE,
      errorTarget: logoError,
      previewTarget: logoPreview,
    }
  }
  return {
    emitName: 'set-background',
    maxSize: BACKGROUND_MAX_SIZE,
    errorTarget: backgroundError,
    previewTarget: backgroundPreview,
  }
}

function handleImageUpload(event, type) {
  const { emitName, maxSize, errorTarget, previewTarget } = getUploadConfig(type)
  const file = event.target.files?.[0]
  event.target.value = ''
  errorTarget.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorTarget.value = '請選擇圖片檔案。'
    return
  }
  if (file.size > maxSize) {
    errorTarget.value = `圖片太大，目前是 ${formatFileSize(file.size)}，上限是 ${formatFileSize(maxSize)}。`
    return
  }

  replacePreview(previewTarget, file)
  emit(emitName, file)
}

function resetLogo() {
  clearPreview(logoPreview)
  logoError.value = ''
  emit('reset-logo')
}

function resetBackground() {
  clearPreview(backgroundPreview)
  backgroundError.value = ''
  emit('reset-background')
}

onBeforeUnmount(() => {
  clearPreview(logoPreview)
  clearPreview(backgroundPreview)
})
</script>

<template>
  <div class="theme-picker">
    <button
      type="button"
      class="theme-trigger"
      :aria-expanded="isThemeModalOpen"
      aria-label="開啟風格設定"
      @click="isThemeModalOpen = true"
    >
      <span
        v-for="color in activeSwatches"
        :key="color"
        :style="{ background: color }"
      ></span>
    </button>

    <Teleport to="body">
      <div v-if="isThemeModalOpen" class="theme-modal-backdrop" :data-theme="currentTheme">
        <section class="theme-modal" role="dialog" aria-modal="true" aria-label="風格設定">
          <header class="theme-modal-header">
            <h2>風格設定</h2>
            <button type="button" class="icon-button" aria-label="關閉" @click="isThemeModalOpen = false">
              ×
            </button>
          </header>

          <div class="theme-swatch-grid" aria-label="風格選項">
            <button
              v-for="theme in styleThemes"
              :key="theme.value"
              type="button"
              class="theme-option"
              :class="{ active: currentTheme === theme.value }"
              :aria-label="theme.label"
              @click="chooseTheme(theme.value)"
            >
              <span v-for="color in theme.swatches" :key="color" :style="{ background: color }"></span>
            </button>
          </div>

          <div class="theme-upload-grid">
            <section class="theme-upload-card">
              <div>
                <h3>左上角 Logo</h3>
                <p>上傳商家或比賽宣傳 Logo，會替換首頁與 header Logo。</p>
              </div>
              <div class="theme-logo-preview">
                <img :src="visibleLogo" :class="{ 'custom-logo-preview': hasCustomLogo || logoPreview }" alt="" />
              </div>
              <input
                ref="logoInputRef"
                class="sr-only-input"
                type="file"
                accept="image/*"
                @change="handleImageUpload($event, 'logo')"
              />
              <p v-if="logoError" class="theme-upload-error">{{ logoError }}</p>
              <div class="theme-upload-actions">
                <button type="button" class="secondary-action" @click="logoInputRef?.click()">上傳 Logo</button>
                <button
                  v-if="hasCustomLogo || logoPreview"
                  type="button"
                  class="ghost"
                  @click="resetLogo"
                >
                  還原
                </button>
              </div>
            </section>

            <section class="theme-upload-card">
              <div>
                <h3>背景圖片</h3>
                <p>上傳後會蓋在頁面後方，透明度固定為 35%。</p>
              </div>
              <div
                class="theme-background-preview"
                :class="{ empty: !hasBackgroundImage }"
                :style="backgroundPreviewStyle"
              >
                <span>{{ hasBackgroundImage || backgroundPreview ? '已套用背景' : '尚未上傳' }}</span>
              </div>
              <input
                ref="backgroundInputRef"
                class="sr-only-input"
                type="file"
                accept="image/*"
                @change="handleImageUpload($event, 'background')"
              />
              <p v-if="backgroundError" class="theme-upload-error">{{ backgroundError }}</p>
              <div class="theme-upload-actions">
                <button type="button" class="secondary-action" @click="backgroundInputRef?.click()">上傳背景</button>
                <button
                  v-if="hasBackgroundImage || backgroundPreview"
                  type="button"
                  class="ghost"
                  @click="resetBackground"
                >
                  移除
                </button>
                <div class="background-fit-options" aria-label="背景呈現方式">
                  <button
                    v-for="option in backgroundFitOptions"
                    :key="option.value"
                    type="button"
                    :class="{ active: backgroundFit === option.value }"
                    @click="emit('set-background-fit', option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>
