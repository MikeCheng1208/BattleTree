<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BracketListModal from './components/BracketListModal.vue'
import BracketSetup from './components/BracketSetup.vue'
import BracketView from './components/BracketView.vue'
import LotteryModal from './components/LotteryModal.vue'
import ThemePicker from './components/ThemePicker.vue'
import Toolbar from './components/Toolbar.vue'
import battleTreeLogo from './assets/logo.svg'
import { useBracketExport } from './composables/useBracketExport'
import { useBrackets } from './composables/useBrackets'
import { getPodium } from './composables/useBracketEngine'
import { createImageUrl, getStoredImage, removeStoredImage, setStoredImage } from './composables/useImageStorage'

const {
  bracketList,
  currentId,
  currentBracket,
  addBracket,
  selectBracket,
  deleteBracket,
  resetCurrentBracket,
  updateCurrent,
  setPlayerCount,
  addPlayer,
  importPlayers,
  updatePlayer,
  removePlayer,
  reorderPlayerSeeds,
  shufflePlayerSeeds,
  setPairingMode,
  setGroupCount,
  setRepechageEnabled,
  setRepechageSelectionMode,
  setRepechageEntryCount,
  generateBracket,
  configureRepechage,
  applyRepechageSettingsDuringMatch,
  resetRepechageSelection,
  setResult,
  updateScore,
  updateLottery,
} = useBrackets()

const VIEW_STORAGE = 'battletree:view'
const THEME_STORAGE = 'battletree:theme'
const BACKGROUND_FIT_STORAGE = 'battletree:background-fit'
const CUSTOM_LOGO_KEY = 'custom-logo'
const BACKGROUND_IMAGE_KEY = 'background-image'
const styleThemes = [
  { value: 'mono', label: '黑白灰', swatches: ['#050505', '#ffffff', '#8a8a8a'] },
  { value: 'inverse', label: '暗色模式', swatches: ['#090d12', '#66d9ff', '#eef6fb'] },
  { value: 'steel', label: '冷藍', swatches: ['#123047', '#e8f0f6', '#5f7f95'] },
  { value: 'forest', label: '森林', swatches: ['#173527', '#eef4ec', '#6d8f63'] },
  { value: 'copper', label: '赤銅', swatches: ['#4a2518', '#f5eee8', '#b56a42'] },
]
const showList = ref(false)
const showLottery = ref(false)
const showHomeConfirm = ref(false)
const showResultModal = ref(false)
const dismissedResultKey = ref('')
const exportTarget = ref(null)
const bracketViewRef = ref(null)
const generationErrors = ref([])
const showHome = ref(localStorage.getItem(VIEW_STORAGE) !== 'app')
const homeLeaving = ref(false)
const currentTheme = ref(localStorage.getItem(THEME_STORAGE) || 'mono')
const backgroundFit = ref(localStorage.getItem(BACKGROUND_FIT_STORAGE) || 'cover-center')
const customLogo = ref('')
const backgroundImage = ref('')

const canExport = computed(() => currentBracket.value?.status === 'ready')
const displayedLogo = computed(() => customLogo.value || battleTreeLogo)
const podium = computed(() => (currentBracket.value ? getPodium(currentBracket.value) : null))
const resultRows = computed(() => {
  const bracket = currentBracket.value
  const result = podium.value
  if (!bracket || !result) return []
  const playerMap = Object.fromEntries((bracket.players ?? []).map((player) => [player.id, player]))
  return [
    { rank: 1, label: '第一名', className: 'gold', player: playerMap[result.championId] },
    { rank: 2, label: '第二名', className: 'silver', player: playerMap[result.runnerUpId] },
    { rank: 3, label: '第三名', className: 'bronze', player: playerMap[result.thirdPlaceId] },
    { rank: 4, label: '第四名', className: 'medal', player: playerMap[result.fourthPlaceId] },
  ]
})
const resultCompletionKey = computed(() => {
  const rows = resultRows.value
  if (currentBracket.value?.status !== 'ready' || rows.length !== 4 || rows.some((row) => !row.player)) return ''
  return `${currentBracket.value.id}:${rows.map((row) => row.player.id).join('|')}`
})
const shellStyle = computed(() => ({
  '--custom-bg-image': backgroundImage.value ? `url(${backgroundImage.value})` : 'none',
  '--custom-bg-blur-image': backgroundImage.value && backgroundFit.value === 'contain' ? `url(${backgroundImage.value})` : 'none',
  '--custom-bg-size': getBackgroundFitStyle(backgroundFit.value).size,
  '--custom-bg-position': getBackgroundFitStyle(backgroundFit.value).position,
}))
const exportApi = useBracketExport(
  exportTarget,
  currentBracket,
  () => bracketViewRef.value?.getExportElement?.() ?? exportTarget.value,
)
const isFullscreen = computed(() => exportApi.isFullscreen.value)

function updateName(value) {
  const name = typeof value === 'string' ? value : value.target.value
  updateCurrent({ name: name || '新對戰表' })
}

function handleGenerate() {
  const result = generateBracket()
  generationErrors.value = result.errors
  if (result.ok) {
    showResultModal.value = false
    dismissedResultKey.value = ''
  }
}

function handleAddBracket() {
  showResultModal.value = false
  dismissedResultKey.value = resultCompletionKey.value
  addBracket()
  localStorage.setItem(VIEW_STORAGE, 'app')
  showHome.value = false
}

function handleDelete(id = currentId.value) {
  const bracket = bracketList.value.find((item) => item.id === id)
  if (!bracket) return
  if (confirm(`確定刪除「${bracket.name}」？`)) {
    deleteBracket(id)
    if (showList.value && !bracketList.value.length) showList.value = false
  }
}

function handleSelect(id) {
  selectBracket(id)
  showList.value = false
}

function handleReshuffle() {
  if (confirm('重新抽籤會清空目前所有比賽結果，確定繼續？')) {
    generateBracket('random')
  }
}

function handleApplyRepechageSettings(payload) {
  const result = applyRepechageSettingsDuringMatch(payload)
  if (!result.ok) alert(result.errors.join('\n'))
}

function startBattle() {
  if (homeLeaving.value) return
  homeLeaving.value = true
  window.setTimeout(() => {
    localStorage.setItem(VIEW_STORAGE, 'app')
    showHome.value = false
    homeLeaving.value = false
  }, 1320)
}

function requestHome() {
  showHomeConfirm.value = true
}

function returnHome({ preserve }) {
  if (!preserve) resetCurrentBracket()
  showResultModal.value = false
  showHomeConfirm.value = false
  localStorage.setItem(VIEW_STORAGE, 'home')
  showHome.value = true
  homeLeaving.value = false
}

async function downloadCompletedBracket() {
  await exportApi.downloadJpeg()
}

function goHomeFromResult() {
  showResultModal.value = false
  dismissedResultKey.value = resultCompletionKey.value
  localStorage.setItem(VIEW_STORAGE, 'home')
  showHome.value = true
  homeLeaving.value = false
}

function closeResultModal() {
  dismissedResultKey.value = resultCompletionKey.value
  showResultModal.value = false
}

function setTheme(theme) {
  currentTheme.value = theme
  localStorage.setItem(THEME_STORAGE, theme)
}

function getBackgroundFitStyle(mode) {
  const styles = {
    contain: { size: 'contain', position: 'center' },
    'cover-center': { size: 'cover', position: 'center' },
    'cover-top': { size: 'cover', position: 'top center' },
    actual: { size: 'auto', position: 'center' },
  }
  return styles[mode] ?? styles['cover-center']
}

function setBackgroundFit(mode) {
  backgroundFit.value = mode
  localStorage.setItem(BACKGROUND_FIT_STORAGE, mode)
}

function replaceImageUrl(target, nextUrl) {
  if (target.value) URL.revokeObjectURL(target.value)
  target.value = nextUrl
}

async function setCustomLogo(file) {
  replaceImageUrl(customLogo, createImageUrl(file))
  try {
    await setStoredImage(CUSTOM_LOGO_KEY, file)
  } catch (error) {
    console.error('Failed to save custom logo', error)
    alert('Logo 儲存失敗，請確認瀏覽器是否允許本地儲存。')
  }
}

async function resetCustomLogo() {
  try {
    await removeStoredImage(CUSTOM_LOGO_KEY)
    replaceImageUrl(customLogo, '')
  } catch (error) {
    console.error('Failed to remove custom logo', error)
  }
}

async function setBackgroundImage(file) {
  replaceImageUrl(backgroundImage, createImageUrl(file))
  try {
    await setStoredImage(BACKGROUND_IMAGE_KEY, file)
  } catch (error) {
    console.error('Failed to save background image', error)
    alert('背景圖片儲存失敗，請確認瀏覽器是否允許本地儲存。')
  }
}

async function resetBackgroundImage() {
  try {
    await removeStoredImage(BACKGROUND_IMAGE_KEY)
    replaceImageUrl(backgroundImage, '')
  } catch (error) {
    console.error('Failed to remove background image', error)
  }
}

onMounted(async () => {
  try {
    const [storedLogo, storedBackground] = await Promise.all([
      getStoredImage(CUSTOM_LOGO_KEY),
      getStoredImage(BACKGROUND_IMAGE_KEY),
    ])
    if (storedLogo) customLogo.value = createImageUrl(storedLogo)
    if (storedBackground) backgroundImage.value = createImageUrl(storedBackground)
  } catch (error) {
    console.error('Failed to load stored theme images', error)
  }
})

watch(
  resultCompletionKey,
  (key) => {
    if (!key || key === dismissedResultKey.value) return
    showResultModal.value = true
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (customLogo.value) URL.revokeObjectURL(customLogo.value)
  if (backgroundImage.value) URL.revokeObjectURL(backgroundImage.value)
})
</script>

<template>
  <main class="app-shell" :data-theme="currentTheme" :style="shellStyle">
    <section v-if="showHome" class="home-screen" :class="{ leaving: homeLeaving }">
      <ThemePicker
        class="home-theme-picker"
        :current-theme="currentTheme"
        :style-themes="styleThemes"
        :logo-src="displayedLogo"
        :background-image="backgroundImage"
        :background-fit="backgroundFit"
        :has-custom-logo="Boolean(customLogo)"
        :has-background-image="Boolean(backgroundImage)"
        @set-theme="setTheme"
        @set-background-fit="setBackgroundFit"
        @set-logo="setCustomLogo"
        @reset-logo="resetCustomLogo"
        @set-background="setBackgroundImage"
        @reset-background="resetBackgroundImage"
      />
      <div class="home-exit-layers" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="home-brand" aria-label="BattleTree">
        <img :src="battleTreeLogo" alt="" />
      </div>
      <button type="button" class="home-start" :disabled="homeLeaving" @click="startBattle">
        開始對戰
      </button>
    </section>

    <template v-else>
    <Toolbar
      :can-export="canExport"
      :is-fullscreen="isFullscreen"
      :logo-src="displayedLogo"
      :current-theme="currentTheme"
      :style-themes="styleThemes"
      :background-image="backgroundImage"
      :background-fit="backgroundFit"
      :has-custom-logo="Boolean(customLogo)"
      :has-background-image="Boolean(backgroundImage)"
      @add="handleAddBracket"
      @list="showList = true"
      @delete="handleDelete()"
      @lottery="showLottery = true"
      @fullscreen="exportApi.toggle"
      @download="exportApi.downloadJpeg"
      @home="requestHome"
      @set-theme="setTheme"
      @set-background-fit="setBackgroundFit"
      @set-logo="setCustomLogo"
      @reset-logo="resetCustomLogo"
      @set-background="setBackgroundImage"
      @reset-background="resetBackgroundImage"
    />

    <section v-if="currentBracket?.status === 'setup'" class="content-wrap">
      <BracketSetup
        :bracket="currentBracket"
        @update-name="updateName"
        @set-player-count="setPlayerCount"
        @add-player="addPlayer"
        @import-players="importPlayers"
        @update-player="updatePlayer"
        @remove-player="removePlayer"
        @reorder-player-seeds="reorderPlayerSeeds"
        @shuffle-player-seeds="shufflePlayerSeeds"
        @set-pairing-mode="setPairingMode"
        @set-group-count="setGroupCount"
        @set-repechage-enabled="setRepechageEnabled"
        @set-repechage-selection-mode="setRepechageSelectionMode"
        @set-repechage-entry-count="setRepechageEntryCount"
        @generate="handleGenerate"
      />
      <ul v-if="generationErrors.length" class="error-list">
        <li v-for="error in generationErrors" :key="error">{{ error }}</li>
      </ul>
    </section>

    <section v-else ref="exportTarget" class="export-surface" :class="{ fullscreen: isFullscreen }">
      <button
        v-if="isFullscreen"
        type="button"
        class="fullscreen-exit"
        aria-label="解除全螢幕"
        @click="exportApi.exit"
      >
        <span></span>
        <span></span>
      </button>
      <BracketView
        ref="bracketViewRef"
        :bracket="currentBracket"
        @set-result="setResult"
        @update-score="updateScore"
        @reshuffle="handleReshuffle"
        @configure-repechage="configureRepechage"
        @apply-repechage-settings="handleApplyRepechageSettings"
        @reset-repechage="resetRepechageSelection"
      />
    </section>

    <BracketListModal
      v-if="showList"
      :brackets="bracketList"
      :current-id="currentId"
      @close="showList = false"
      @select="handleSelect"
      @delete="handleDelete"
    />

    <LotteryModal
      v-if="showLottery && currentBracket"
      :bracket="currentBracket"
      @close="showLottery = false"
      @update-lottery="updateLottery"
    />

    <div v-if="showHomeConfirm" class="modal-backdrop">
      <section class="modal-panel compact home-confirm" role="dialog" aria-modal="true">
        <header class="modal-header">
          <h2>回到首頁</h2>
          <button type="button" class="icon-button" aria-label="關閉" @click="showHomeConfirm = false">
            ×
          </button>
        </header>
        <p>是否要保留目前的輸入內容？</p>
        <div class="stage-actions">
          <button type="button" class="primary-action" @click="returnHome({ preserve: true })">
            保留內容
          </button>
          <button type="button" class="secondary-action" @click="returnHome({ preserve: false })">
            不保留，重置
          </button>
          <button type="button" class="ghost" @click="showHomeConfirm = false">取消</button>
        </div>
      </section>
    </div>

    <div v-if="showResultModal" class="modal-backdrop result-modal-backdrop">
      <section class="modal-panel compact result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <header class="modal-header">
          <div>
            <span class="result-kicker">BattleTree Result</span>
            <h2 id="result-title">最終名次</h2>
          </div>
          <button type="button" class="icon-button" aria-label="關閉" @click="closeResultModal">
            ×
          </button>
        </header>

        <ol class="result-ranking-list">
          <li v-for="row in resultRows" :key="row.rank" :class="row.className">
            <span class="result-rank">{{ row.rank }}</span>
            <div>
              <span>{{ row.label }}</span>
              <strong>{{ row.player?.name }}</strong>
            </div>
            <small>#{{ row.player?.seed }}</small>
          </li>
        </ol>

        <div class="result-actions">
          <button type="button" class="primary-action" @click="downloadCompletedBracket">
            下載完整對戰表
          </button>
          <button type="button" class="secondary-action" @click="handleAddBracket">
            重新開啟新的對戰
          </button>
          <button type="button" class="secondary-action" @click="goHomeFromResult">
            回到首頁
          </button>
        </div>
      </section>
    </div>
    </template>
  </main>
</template>
