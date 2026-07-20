<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BracketListModal from './components/BracketListModal.vue'
import BracketSetup from './components/BracketSetup.vue'
import BracketTabs from './components/BracketTabs.vue'
import BracketView from './components/BracketView.vue'
import CloseBracketModal from './components/CloseBracketModal.vue'
import LotteryModal from './components/LotteryModal.vue'
import NewBracketModal from './components/NewBracketModal.vue'
import PrelimView from './components/PrelimView.vue'
import RenameBracketModal from './components/RenameBracketModal.vue'
import ThemePicker from './components/ThemePicker.vue'
import Toolbar from './components/Toolbar.vue'
import battleTreeLogo from './assets/logo.svg'
import { useBracketExport } from './composables/useBracketExport'
import { useBrackets } from './composables/useBrackets'
import { getPodium } from './composables/useBracketEngine'
import { createImageUrl, getStoredImage, removeStoredImage, setStoredImage } from './composables/useImageStorage'

const {
  bracketList,
  openBrackets,
  currentId,
  currentBracket,
  addBracket,
  openBracketTab,
  closeBracketTab,
  deleteBracket,
  resetCurrentBracket,
  updateCurrent,
  renameBracket,
  setPlayerCount,
  addPlayer,
  importPlayers,
  updatePlayer,
  removePlayer,
  reorderPlayerSeeds,
  shufflePlayerSeeds,
  setPairingMode,
  setGroupCount,
  setFormat,
  setPrelimGroupSize,
  setPrelimResult,
  updatePrelimScore,
  generateKnockoutFromPrelim,
  reopenPrelim,
  setFreeSlotCount,
  fillFreeSlot,
  addAndFillFreeSlot,
  clearFreeSlot,
  confirmFreeSlotBye,
  revokeFreeSlotBye,
  randomFillFreeSlots,
  confirmAllRemainingByes,
  generateBracket,
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
const showNewBracket = ref(false)
const showLottery = ref(false)
const showHomeConfirm = ref(false)
const showResultModal = ref(false)
const closingBracketId = ref(null)
const renamingBracketId = ref(null)
const dismissedResultKeys = ref(new Set())
const exportTarget = ref(null)
const bracketViewRef = ref(null)
const tabUiStates = new Map()
const generationErrors = ref([])
const showHome = ref(localStorage.getItem(VIEW_STORAGE) !== 'app')
const homeLeaving = ref(false)
const currentTheme = ref(localStorage.getItem(THEME_STORAGE) || 'mono')
const backgroundFit = ref(localStorage.getItem(BACKGROUND_FIT_STORAGE) || 'cover-center')
const customLogo = ref('')
const backgroundImage = ref('')

const canExport = computed(() => currentBracket.value?.status === 'ready')
const bracketStage = ref('knockout')
const showStageTabs = computed(
  () => currentBracket.value?.format === 'prelim' && currentBracket.value?.status === 'ready',
)
const showPrelimStage = computed(() => {
  const bracket = currentBracket.value
  if (bracket?.format !== 'prelim') return false
  return bracket.status === 'prelim' || (bracket.status === 'ready' && bracketStage.value === 'prelim')
})
const displayedLogo = computed(() => customLogo.value || battleTreeLogo)
const closingBracket = computed(() => bracketList.value.find((bracket) => bracket.id === closingBracketId.value) ?? null)
const renamingBracket = computed(() => bracketList.value.find((bracket) => bracket.id === renamingBracketId.value) ?? null)
const podium = computed(() => (currentBracket.value ? getPodium(currentBracket.value) : null))
const resultRows = computed(() => {
  const bracket = currentBracket.value
  const result = podium.value
  if (!bracket || !result) return []
  const playerMap = Object.fromEntries((bracket.players ?? []).map((player) => [player.id, player]))
  const rows = [
    { rank: 1, label: '第一名', className: 'gold', player: playerMap[result.championId] },
    { rank: 2, label: '第二名', className: 'silver', player: playerMap[result.runnerUpId] },
    { rank: 3, label: '第三名', className: 'bronze', player: playerMap[result.thirdPlaceId] },
  ]
  if (!result.isFinalThree) {
    rows.push({ rank: 4, label: '第四名', className: 'medal', player: playerMap[result.fourthPlaceId] })
  }
  return rows
})
const resultCompletionKey = computed(() => {
  const rows = resultRows.value
  const expectedCount = podium.value?.isFinalThree ? 3 : 4
  if (
    currentBracket.value?.status !== 'ready' ||
    rows.length !== expectedCount ||
    rows.some((row) => !row.player)
  ) {
    return ''
  }
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

function dismissCurrentResult() {
  const key = resultCompletionKey.value
  if (!key) return
  dismissedResultKeys.value = new Set([...dismissedResultKeys.value, key])
}

function clearDismissedResults(bracketId) {
  if (!bracketId) return
  dismissedResultKeys.value = new Set(
    [...dismissedResultKeys.value].filter((key) => !key.startsWith(`${bracketId}:`)),
  )
}

function captureCurrentTabState() {
  const id = currentId.value
  if (!id) return
  const previous = tabUiStates.get(id) ?? {}
  tabUiStates.set(id, {
    ...previous,
    bracketStage: bracketStage.value,
    bracketView: bracketViewRef.value?.getViewState?.() ?? previous.bracketView ?? null,
  })
}

function updateName(value) {
  const name = typeof value === 'string' ? value : value.target.value
  updateCurrent({ name: name || '新對戰表' })
}

function handleGenerate() {
  const result = generateBracket()
  generationErrors.value = result.errors
  if (result.ok) {
    showResultModal.value = false
    clearDismissedResults(currentId.value)
    tabUiStates.delete(currentId.value)
  }
}

function handleAddBracket() {
  dismissCurrentResult()
  showResultModal.value = false
  showNewBracket.value = true
}

function handleCreateBracket(options) {
  captureCurrentTabState()
  addBracket({ ...options, sourceBracketId: currentId.value })
  showNewBracket.value = false
  localStorage.setItem(VIEW_STORAGE, 'app')
  showHome.value = false
}

function handleOpenSavedBracket(id) {
  if (id !== currentId.value) captureCurrentTabState()
  openBracketTab(id)
  showNewBracket.value = false
}

function handleRenameBracket(id, name) {
  renameBracket(id, name)
}

function saveRenamedBracket(name) {
  if (renamingBracketId.value) renameBracket(renamingBracketId.value, name)
  renamingBracketId.value = null
}

function handleDelete(id = currentId.value) {
  const bracket = bracketList.value.find((item) => item.id === id)
  if (!bracket) return
  if (confirm(`確定刪除「${bracket.name}」？`)) {
    if (id === currentId.value) captureCurrentTabState()
    deleteBracket(id)
    tabUiStates.delete(id)
    if (showList.value && !bracketList.value.length) showList.value = false
  }
}

function handleSelect(id) {
  if (id !== currentId.value) captureCurrentTabState()
  openBracketTab(id)
  showList.value = false
}

function handleCloseTab(id) {
  if (!bracketList.value.some((bracket) => bracket.id === id)) return
  closingBracketId.value = id
}

function saveAndCloseBracket() {
  const id = closingBracketId.value
  if (!id) return
  const wasCurrent = id === currentId.value
  if (wasCurrent) captureCurrentTabState()
  closeBracketTab(id)
  if (wasCurrent) {
    showLottery.value = false
    showResultModal.value = false
  }
  closingBracketId.value = null
}

function deleteClosingBracket() {
  const id = closingBracketId.value
  if (!id) return
  const wasCurrent = id === currentId.value
  if (wasCurrent) captureCurrentTabState()
  deleteBracket(id)
  tabUiStates.delete(id)
  if (wasCurrent) {
    showLottery.value = false
    showResultModal.value = false
  }
  if (showList.value && !bracketList.value.length) showList.value = false
  closingBracketId.value = null
}

function handleReshuffle() {
  if (confirm('重新抽籤會清空目前所有比賽結果，確定繼續？')) {
    generateBracket('random')
  }
}

function handlePrelimReshuffle() {
  if (confirm('重新分組抽籤會清空所有預賽結果，確定繼續？')) {
    generateBracket('random')
  }
}

function handleGenerateKnockout() {
  const result = generateKnockoutFromPrelim()
  if (!result.ok) {
    alert(result.errors.join('\n'))
    return
  }
  bracketStage.value = 'knockout'
  tabUiStates.delete(currentId.value)
}

function handleReopenPrelim() {
  if (confirm('回到預賽修改會清除目前淘汰賽的所有結果，確定繼續？')) {
    reopenPrelim()
    bracketStage.value = 'prelim'
  }
}

function handleSetFreeSlotCount(count) {
  const result = setFreeSlotCount(count)
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
  captureCurrentTabState()
  if (!preserve) {
    tabUiStates.delete(currentId.value)
    resetCurrentBracket()
  }
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
  captureCurrentTabState()
  dismissCurrentResult()
  showResultModal.value = false
  localStorage.setItem(VIEW_STORAGE, 'home')
  showHome.value = true
  homeLeaving.value = false
}

function closeResultModal() {
  dismissCurrentResult()
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
  () => [currentBracket.value?.id, currentBracket.value?.status],
  ([id, status], [previousId] = []) => {
    generationErrors.value = []
    showLottery.value = false
    showResultModal.value = false
    if (!id) {
      bracketStage.value = 'knockout'
      return
    }
    if (id !== previousId) {
      bracketStage.value =
        tabUiStates.get(id)?.bracketStage ?? (status === 'prelim' ? 'prelim' : 'knockout')
      return
    }
    if (status === 'prelim') bracketStage.value = 'prelim'
    if (status === 'setup') bracketStage.value = 'knockout'
  },
  { immediate: true },
)

watch(
  resultCompletionKey,
  (key) => {
    if (!key || dismissedResultKeys.value.has(key)) return
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
  <main
    class="app-shell"
    :class="{ 'battle-active': !showHome && currentBracket && currentBracket.status !== 'setup' }"
    :data-theme="currentTheme"
    :style="shellStyle"
  >
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
    <div class="app-navigation">
      <Toolbar
        :has-current-bracket="Boolean(currentBracket)"
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
      <BracketTabs
        :brackets="openBrackets"
        :current-id="currentId"
        @select="handleSelect"
        @close="handleCloseTab"
        @add="handleAddBracket"
        @rename="handleRenameBracket"
        @request-rename="renamingBracketId = $event"
      />
    </div>

    <section v-if="!currentBracket" id="bracket-workspace" class="empty-workspace">
      <span>WORKSPACE EMPTY</span>
      <h1>尚未開啟對戰表</h1>
      <p>新增一份對戰表，或從已儲存的對戰表中重新開啟。</p>
      <div class="empty-workspace-actions">
        <button type="button" class="primary-action" @click="handleAddBracket">新增對戰表</button>
        <button type="button" class="secondary-action" @click="showList = true">從所有對戰表開啟</button>
      </div>
    </section>

    <section v-else-if="currentBracket.status === 'setup'" id="bracket-workspace" class="content-wrap">
      <BracketSetup
        :key="currentBracket.id"
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
        @set-format="setFormat"
        @set-prelim-group-size="setPrelimGroupSize"
        @set-free-slot-count="handleSetFreeSlotCount"
        @generate="handleGenerate"
      />
      <ul v-if="generationErrors.length" class="error-list">
        <li v-for="error in generationErrors" :key="error">{{ error }}</li>
      </ul>
    </section>

    <section
      v-else
      id="bracket-workspace"
      ref="exportTarget"
      class="export-surface"
      :class="{ fullscreen: isFullscreen, 'prelim-stage': showPrelimStage }"
    >
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
      <div v-if="showStageTabs" class="segmented stage-tabs" role="tablist" aria-label="賽事階段">
        <button
          type="button"
          :class="{ active: bracketStage === 'prelim' }"
          @click="bracketStage = 'prelim'"
        >
          預賽
        </button>
        <button
          type="button"
          :class="{ active: bracketStage === 'knockout' }"
          @click="bracketStage = 'knockout'"
        >
          淘汰賽
        </button>
      </div>
      <PrelimView
        v-if="showPrelimStage"
        :key="`${currentBracket.id}-prelim`"
        :bracket="currentBracket"
        :locked="currentBracket.status === 'ready'"
        @set-result="setPrelimResult"
        @update-score="updatePrelimScore"
        @generate-knockout="handleGenerateKnockout"
        @reshuffle="handlePrelimReshuffle"
        @reopen="handleReopenPrelim"
      />
      <BracketView
        v-else
        :key="currentBracket.id"
        ref="bracketViewRef"
        :bracket="currentBracket"
        :initial-view-state="tabUiStates.get(currentBracket.id)?.bracketView ?? null"
        @set-result="setResult"
        @update-score="updateScore"
        @reshuffle="handleReshuffle"
        @fill-free-slot="fillFreeSlot"
        @add-free-player="addAndFillFreeSlot"
        @clear-free-slot="clearFreeSlot"
        @confirm-free-bye="confirmFreeSlotBye"
        @revoke-free-bye="revokeFreeSlotBye"
        @random-fill-free-slots="randomFillFreeSlots"
        @confirm-all-byes="confirmAllRemainingByes"
      />
    </section>

    <BracketListModal
      v-if="showList"
      :brackets="bracketList"
      :current-id="currentId"
      :open-ids="openBrackets.map((bracket) => bracket.id)"
      @close="showList = false"
      @select="handleSelect"
      @delete="handleDelete"
    />

    <NewBracketModal
      v-if="showNewBracket"
      :current-bracket="currentBracket"
      :brackets="bracketList"
      :open-ids="openBrackets.map((bracket) => bracket.id)"
      @close="showNewBracket = false"
      @create="handleCreateBracket"
      @open-saved="handleOpenSavedBracket"
    />

    <CloseBracketModal
      v-if="closingBracket"
      :bracket="closingBracket"
      @cancel="closingBracketId = null"
      @save="saveAndCloseBracket"
      @delete="deleteClosingBracket"
    />

    <RenameBracketModal
      v-if="renamingBracket"
      :bracket="renamingBracket"
      @cancel="renamingBracketId = null"
      @save="saveRenamedBracket"
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
              <strong>{{ row.player?.displayName }}</strong>
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
