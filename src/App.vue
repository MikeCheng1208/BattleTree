<script setup>
import { computed, ref } from 'vue'
import BracketListModal from './components/BracketListModal.vue'
import BracketSetup from './components/BracketSetup.vue'
import BracketView from './components/BracketView.vue'
import LotteryModal from './components/LotteryModal.vue'
import Toolbar from './components/Toolbar.vue'
import { useBracketExport } from './composables/useBracketExport'
import { useBrackets } from './composables/useBrackets'

const {
  bracketList,
  currentId,
  currentBracket,
  addBracket,
  selectBracket,
  deleteBracket,
  updateCurrent,
  setPlayerCount,
  updatePlayer,
  setPairingMode,
  generateBracket,
  setResult,
  updateScore,
  updateLottery,
} = useBrackets()

const showList = ref(false)
const showLottery = ref(false)
const exportTarget = ref(null)
const bracketViewRef = ref(null)
const generationErrors = ref([])

const canExport = computed(() => currentBracket.value?.status === 'ready')
const exportApi = useBracketExport(
  exportTarget,
  currentBracket,
  () => bracketViewRef.value?.getExportElement?.() ?? exportTarget.value,
)
const isFullscreen = computed(() => exportApi.isFullscreen.value)

function updateName(event) {
  updateCurrent({ name: event.target.value || '新對戰表' })
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
</script>

<template>
  <main class="app-shell">
    <Toolbar
      :can-export="canExport"
      :is-fullscreen="isFullscreen"
      @add="addBracket"
      @list="showList = true"
      @delete="handleDelete()"
      @lottery="showLottery = true"
      @fullscreen="exportApi.toggle"
      @download="exportApi.downloadJpeg"
    >
      <template #start>
        <label class="title-editor">
          <span>比賽名稱</span>
          <input :value="currentBracket?.name" type="text" @input="updateName" />
        </label>
      </template>
    </Toolbar>

    <section v-if="currentBracket?.status === 'setup'" class="content-wrap">
      <BracketSetup
        :bracket="currentBracket"
        @set-player-count="setPlayerCount"
        @update-player="updatePlayer"
        @set-pairing-mode="setPairingMode"
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
  </main>
</template>
