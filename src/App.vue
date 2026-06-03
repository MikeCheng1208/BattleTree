<script setup>
import { computed, ref } from 'vue'
import BracketListModal from './components/BracketListModal.vue'
import BracketSetup from './components/BracketSetup.vue'
import BracketView from './components/BracketView.vue'
import LotteryModal from './components/LotteryModal.vue'
import Toolbar from './components/Toolbar.vue'
import battleTreeLogo from './assets/logo.svg'
import { useBracketExport } from './composables/useBracketExport'
import { useBrackets } from './composables/useBrackets'

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
  updatePlayer,
  setPairingMode,
  setGroupCount,
  generateBracket,
  setResult,
  updateScore,
  updateLottery,
} = useBrackets()

const VIEW_STORAGE = 'battletree:view'
const showList = ref(false)
const showLottery = ref(false)
const showHomeConfirm = ref(false)
const exportTarget = ref(null)
const bracketViewRef = ref(null)
const generationErrors = ref([])
const showHome = ref(localStorage.getItem(VIEW_STORAGE) !== 'app')
const homeLeaving = ref(false)

const canExport = computed(() => currentBracket.value?.status === 'ready')
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
  showHomeConfirm.value = false
  localStorage.setItem(VIEW_STORAGE, 'home')
  showHome.value = true
  homeLeaving.value = false
}
</script>

<template>
  <main class="app-shell">
    <section v-if="showHome" class="home-screen" :class="{ leaving: homeLeaving }">
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
      :logo-src="battleTreeLogo"
      @add="addBracket"
      @list="showList = true"
      @delete="handleDelete()"
      @lottery="showLottery = true"
      @fullscreen="exportApi.toggle"
      @download="exportApi.downloadJpeg"
      @home="requestHome"
    />

    <section v-if="currentBracket?.status === 'setup'" class="content-wrap">
      <BracketSetup
        :bracket="currentBracket"
        @update-name="updateName"
        @set-player-count="setPlayerCount"
        @update-player="updatePlayer"
        @set-pairing-mode="setPairingMode"
        @set-group-count="setGroupCount"
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
    </template>
  </main>
</template>
