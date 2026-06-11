<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import MatchCard from './MatchCard.vue'
import {
  deriveRounds,
  getBracketGroups,
  getFirstRoundState,
  getPlayerMap,
  getPodium,
  getRepechageMatches,
} from '../composables/useBracketEngine'
import { usePanZoom } from '../composables/usePanZoom'

const VIEW_MODES = [
  { value: 'ladder', label: '標準' },
  { value: 'columns', label: '橫向' },
  { value: 'groups', label: '分組' },
]

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['set-result', 'update-score', 'reshuffle', 'configure-repechage', 'reset-repechage'])

const viewportRef = ref(null)
const contentRef = ref(null)
const boardRef = ref(null)
const matchRefs = ref({})
const lines = ref([])
const scoreLabels = ref([])
const viewMode = ref('ladder')
const activeGroupTab = ref('group-0')
const showRepechageManager = ref(false)
const showRepechagePrompt = ref(false)
const dismissedRepechagePromptKey = ref('')
const manualRepechageSelection = ref([])

const rounds = computed(() => deriveRounds(props.bracket))
const displayRounds = computed(() => (viewMode.value === 'ladder' ? [...rounds.value].reverse() : rounds.value))
const baseMatchCount = computed(() => Math.max(1, rounds.value[0]?.length ?? 1))
const bracketGroups = computed(() => getBracketGroups(props.bracket))
const availableViewModes = computed(() =>
  bracketGroups.value.length > 1 ? VIEW_MODES : VIEW_MODES.filter((mode) => mode.value !== 'groups'),
)
const playerMap = computed(() => getPlayerMap(props.bracket.players))
const podium = computed(() => getPodium(props.bracket))
const champion = computed(() => playerMap.value[podium.value.championId] ?? null)
const runnerUp = computed(() => playerMap.value[podium.value.runnerUpId] ?? null)
const thirdPlace = computed(() => playerMap.value[podium.value.thirdPlaceId] ?? null)
const fourthPlace = computed(() => playerMap.value[podium.value.fourthPlaceId] ?? null)
const thirdPlaceMatch = computed(() => podium.value.thirdPlaceMatch)
const firstRoundState = computed(() => getFirstRoundState(props.bracket))
const repechageTargets = computed(() => props.bracket.repechage?.targets ?? [])
const repechageMatches = computed(() => getRepechageMatches(props.bracket))
const repechageRequiredPlayerCount = computed(() => repechageTargets.value.length)
const repechageSelectionMode = computed(() => props.bracket.repechage?.selectionMode ?? 'random')
const repechageStarted = computed(
  () =>
    repechageMatches.value.some((match) => Boolean(match.result)) ||
    repechageTargets.value.some((target) =>
      Boolean(props.bracket.results?.[`r${target.targetRoundIndex}-m${target.targetMatchIndex}`]),
    ),
)
const repechageReady = computed(() => repechageMatches.value.length === repechageTargets.value.length)
const repechagePromptKey = computed(() => {
  if (!props.bracket.repechage?.enabled || !repechageTargets.value.length) return ''
  if (!firstRoundState.value.complete || repechageReady.value) return ''
  return `${props.bracket.id}:${repechageTargets.value.map((target) => target.id).join('|')}:${firstRoundState.value.loserIds.join('|')}`
})
const repechageStatusText = computed(() => {
  if (!props.bracket.repechage?.enabled) return ''
  if (!repechageTargets.value.length) return '本賽程無需敗部復活'
  if (!firstRoundState.value.complete) {
    return `第一輪 ${firstRoundState.value.completed} / ${firstRoundState.value.total}`
  }
  if (!repechageReady.value) return '設定敗部復活'
  if (!repechageStarted.value) return '敗部復活已安插'
  return '敗部復活進行中'
})
const repechageCandidates = computed(() =>
  firstRoundState.value.loserIds.map((id) => playerMap.value[id]).filter(Boolean),
)
const repechageMatchByTarget = computed(() =>
  Object.fromEntries(repechageMatches.value.map((match) => [match.targetId, match])),
)
const groupRoundCount = computed(() => {
  const firstGroup = bracketGroups.value[0]
  return firstGroup ? Math.log2(firstGroup.slotCount) : 0
})
const groupedSections = computed(() =>
  bracketGroups.value.map((group) => {
    const groupRounds = rounds.value.slice(0, groupRoundCount.value).map((round, roundIndex) => {
      const span = 2 ** (roundIndex + 1)
      const startMatch = group.startSlot / span
      const matchCount = group.slotCount / span
      return round.slice(startMatch, startMatch + matchCount)
    })
    return {
      ...group,
      baseMatchCount: Math.max(1, groupRounds[0]?.length ?? 1),
      rounds: [...groupRounds].reverse(),
    }
  }),
)
const finalRounds = computed(() => {
  if (viewMode.value !== 'groups') return []
  return rounds.value.slice(groupRoundCount.value)
})
const finalBaseMatchCount = computed(() => Math.max(1, finalRounds.value[0]?.length ?? 1))
const groupTabs = computed(() => {
  const tabs = groupedSections.value.map((section, index) => ({
    value: `group-${index}`,
    label: `${section.label} 組`,
  }))
  if (finalRounds.value.length) tabs.push({ value: 'final', label: '總決賽' })
  return tabs
})
const activeGroupedSection = computed(() => {
  const index = Number(/^group-(\d+)$/.exec(activeGroupTab.value)?.[1] ?? 0)
  return groupedSections.value[index] ?? groupedSections.value[0] ?? null
})
const {
  scale,
  isDragging,
  transformStyle,
  zoomPercent,
  zoomIn,
  zoomOut,
  resetView,
  fitToView,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
} = usePanZoom(viewportRef, contentRef, boardRef)

function setMatchRef(id, element) {
  if (element) matchRefs.value[id] = element
}

function getMatchGridStyle(roundLength, matchIndex) {
  const span = Math.max(1, baseMatchCount.value / Math.max(1, roundLength))
  if (viewMode.value !== 'ladder') {
    return {
      gridRow: `${Math.floor(matchIndex * span) + 1} / span ${Math.floor(span)}`,
    }
  }
  return {
    gridColumn: `${Math.floor(matchIndex * span) + 1} / span ${Math.floor(span)}`,
  }
}

function getGroupMatchGridStyle(section, roundLength, matchIndex) {
  const span = Math.max(1, section.baseMatchCount / Math.max(1, roundLength))
  const localMatchIndex = matchIndex % section.baseMatchCount
  return {
    gridColumn: `${Math.floor(localMatchIndex * span) + 1} / span ${Math.floor(span)}`,
  }
}

function getFinalMatchGridStyle(roundLength, matchIndex) {
  const span = Math.max(1, finalBaseMatchCount.value / Math.max(1, roundLength))
  return {
    gridColumn: `${Math.floor(matchIndex * span) + 1} / span ${Math.floor(span)}`,
  }
}

function getRepechageMatchForMatch(match) {
  const target = repechageTargets.value.find(
    (item) => item.targetRoundIndex === match.roundIndex && item.targetMatchIndex === match.matchIndex,
  )
  const repechageMatch = target ? repechageMatchByTarget.value[target.id] : null
  return repechageMatch?.isEntry ? null : repechageMatch
}

function toggleManualRepechagePlayer(playerId) {
  if (manualRepechageSelection.value.includes(playerId)) {
    manualRepechageSelection.value = manualRepechageSelection.value.filter((id) => id !== playerId)
    return
  }
  if (manualRepechageSelection.value.length >= repechageRequiredPlayerCount.value) return
  manualRepechageSelection.value = [...manualRepechageSelection.value, playerId]
}

function configureRepechage() {
  emit(
    'configure-repechage',
    repechageSelectionMode.value === 'manual' ? manualRepechageSelection.value : null,
  )
  dismissedRepechagePromptKey.value = repechagePromptKey.value
  showRepechagePrompt.value = false
  showRepechageManager.value = false
}

function openRepechageManagerFromPrompt() {
  dismissedRepechagePromptKey.value = repechagePromptKey.value
  showRepechagePrompt.value = false
  showRepechageManager.value = true
}

function dismissRepechagePrompt() {
  dismissedRepechagePromptKey.value = repechagePromptKey.value
  showRepechagePrompt.value = false
}

function resetRepechage() {
  if (repechageStarted.value) return
  manualRepechageSelection.value = []
  emit('reset-repechage')
}

async function setViewMode(mode) {
  viewMode.value = mode
  if (mode === 'groups' && !groupTabs.value.some((tab) => tab.value === activeGroupTab.value)) {
    activeGroupTab.value = groupTabs.value[0]?.value ?? 'group-0'
  }
  await nextTick()
  await fitToView()
  updateLines()
}

async function setGroupTab(tab) {
  activeGroupTab.value = tab
  await nextTick()
  await fitToView()
  updateLines()
}

function getMatchGroup(match) {
  if (match.roundIndex !== 0 || bracketGroups.value.length <= 1) return null
  const slotIndex = match.matchIndex * 2
  return bracketGroups.value.find((group) => group.startSlot === slotIndex) ?? null
}

function getRect(id) {
  const board = boardRef.value?.getBoundingClientRect()
  const el = matchRefs.value[id]
  if (!board || !el) return null
  const rect = el.getBoundingClientRect()
  return {
    x: (rect.left - board.left) / scale.value,
    y: (rect.top - board.top) / scale.value,
    width: rect.width / scale.value,
    height: rect.height / scale.value,
  }
}

async function updateLines() {
  await nextTick()
  const nextLines = []
  const nextScoreLabels = []
  const visibleMatchIds = new Set(Object.keys(matchRefs.value).filter((id) => matchRefs.value[id]?.isConnected))
  rounds.value.forEach((round, roundIndex) => {
    if (roundIndex === rounds.value.length - 1) return
    round.forEach((match) => {
      const parent = rounds.value[roundIndex + 1]?.[Math.floor(match.matchIndex / 2)]
      if (!parent) return
      if (match.isEmpty || parent.isEmpty) return
      if (!visibleMatchIds.has(match.id) || !visibleMatchIds.has(parent.id)) return
      const childRect = getRect(match.id)
      const parentRect = getRect(parent.id)
      if (!childRect || !parentRect) return

      const isLadder = viewMode.value !== 'columns'
      const x1 = isLadder ? childRect.x + childRect.width / 2 : childRect.x + childRect.width
      const y1 = isLadder ? childRect.y : childRect.y + childRect.height / 2
      const x2 = isLadder ? parentRect.x + parentRect.width / 2 : parentRect.x
      const y2 = isLadder ? parentRect.y + parentRect.height : parentRect.y + parentRect.height / 2
      const midX = x1 + Math.max(28, (x2 - x1) / 2)
      const midY = y1 - Math.max(24, (y1 - y2) / 2)
      nextLines.push({
        id: `${match.id}-${parent.id}`,
        points: isLadder
          ? `${x1},${y1} ${x1},${midY} ${x2},${midY} ${x2},${y2}`
          : `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`,
      })
      if (match.result && (match.result.scoreA !== null || match.result.scoreB !== null)) {
        nextScoreLabels.push({
          id: `${match.id}-score`,
          x: isLadder ? (x1 + x2) / 2 : midX,
          y: isLadder ? midY - 10 : (y1 + y2) / 2 - 10,
          text: `${match.result.scoreA ?? ''} : ${match.result.scoreB ?? ''}`,
        })
      }
    })
  })
  lines.value = nextLines
  scoreLabels.value = nextScoreLabels
}

watch(rounds, updateLines, { deep: true, flush: 'post' })
watch(
  () => props.bracket.id,
  () => {
    showRepechageManager.value = false
    showRepechagePrompt.value = false
    dismissedRepechagePromptKey.value = ''
    manualRepechageSelection.value = []
  },
)
watch(
  repechagePromptKey,
  (key) => {
    if (!key || key === dismissedRepechagePromptKey.value) {
      showRepechagePrompt.value = false
      return
    }
    showRepechagePrompt.value = true
  },
  { immediate: true },
)
watch(
  () => props.bracket.repechage?.selectedPlayerIds,
  (ids) => {
    manualRepechageSelection.value = Array.isArray(ids) ? [...ids] : []
  },
  { deep: true },
)
watch(viewMode, updateLines, { flush: 'post' })
watch(bracketGroups, (groups) => {
  if (viewMode.value === 'groups' && groups.length <= 1) viewMode.value = 'ladder'
  if (!groupTabs.value.some((tab) => tab.value === activeGroupTab.value)) {
    activeGroupTab.value = groupTabs.value[0]?.value ?? 'group-0'
  }
})
watch(
  [() => props.bracket.id, () => props.bracket.slots.length],
  () => {
    viewMode.value = bracketGroups.value.length > 1 ? 'groups' : 'ladder'
    activeGroupTab.value = groupTabs.value[0]?.value ?? 'group-0'
    fitToView()
  },
  { flush: 'post' },
)
useResizeObserver(boardRef, updateLines)
useResizeObserver(viewportRef, () => fitToView({ force: false }))
onMounted(async () => {
  viewMode.value = bracketGroups.value.length > 1 ? 'groups' : 'ladder'
  activeGroupTab.value = groupTabs.value[0]?.value ?? 'group-0'
  await fitToView()
  updateLines()
})

defineExpose({
  getExportElement: () => boardRef.value,
  fitToView,
})
</script>

<template>
  <section class="bracket-viewer">
    <div
      ref="viewportRef"
      class="bracket-viewport"
      :class="{ dragging: isDragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <div class="view-controls" aria-label="視角切換">
        <button
          v-for="mode in availableViewModes"
          :key="mode.value"
          type="button"
          :class="{ active: viewMode === mode.value }"
          @click="setViewMode(mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>

      <div class="board-controls">
        <div class="zoom-controls" aria-label="縮放控制">
          <button type="button" class="manual-zoom-control" @click="zoomOut">縮小</button>
          <span class="manual-zoom-control">{{ zoomPercent }}</span>
          <button type="button" class="manual-zoom-control" @click="zoomIn">放大</button>
          <button type="button" @click="resetView">重置</button>
          <button type="button" @click="fitToView">適合畫面</button>
        </div>
        <button
          v-if="bracket.pairingMode === 'random'"
          type="button"
          class="secondary-action"
          @click="emit('reshuffle')"
        >
          重新抽籤
        </button>
        <button
          v-if="bracket.repechage?.enabled"
          type="button"
          class="secondary-action repechage-manager-button"
          @click="showRepechageManager = true"
        >
          {{ repechageStatusText }}
        </button>
      </div>

      <div ref="contentRef" class="bracket-panzoom-content" :style="transformStyle">
        <section ref="boardRef" class="bracket-board" :class="`view-${viewMode}`">
          <div class="finals-summary" :class="{ 'has-third-place': thirdPlaceMatch }">
            <div class="champion-strip" :class="{ empty: !champion }">
              <span>榮譽榜</span>
              <strong>{{ champion?.name ?? '尚未產生' }}</strong>
              <ol v-if="champion" class="podium-list">
                <li>
                  <span class="podium-icon trophy gold" aria-label="第 1 名">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path class="icon-fill" d="M7.2 4.4h9.6v4.1c0 3-1.8 5.2-4.8 6-3-.8-4.8-3-4.8-6V4.4Z" />
                      <path class="icon-fill" d="M6.9 6.2H3.7v1.5c0 2.8 2.1 5 5 5.2v-2.2c-1.6-.1-2.8-1.4-2.8-3V7.5h1V6.2Z" />
                      <path class="icon-fill" d="M17.1 6.2h3.2v1.5c0 2.8-2.1 5-5 5.2v-2.2c1.6-.1 2.8-1.4 2.8-3V7.5h-1V6.2Z" />
                      <path class="icon-fill" d="M10.8 14.1h2.4v3.1h-2.4v-3.1Z" />
                      <path class="icon-fill" d="M8.6 17.2h6.8l.9 2.4H7.7l.9-2.4Z" />
                      <path class="icon-shine" d="M9.5 6.2h4.8" />
                    </svg>
                  </span>
                  <strong>{{ champion.name }}</strong>
                </li>
                <li v-if="runnerUp">
                  <span class="podium-icon trophy silver" aria-label="第 2 名">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path class="icon-fill" d="M7.2 4.4h9.6v4.1c0 3-1.8 5.2-4.8 6-3-.8-4.8-3-4.8-6V4.4Z" />
                      <path class="icon-fill" d="M6.9 6.2H3.7v1.5c0 2.8 2.1 5 5 5.2v-2.2c-1.6-.1-2.8-1.4-2.8-3V7.5h1V6.2Z" />
                      <path class="icon-fill" d="M17.1 6.2h3.2v1.5c0 2.8-2.1 5-5 5.2v-2.2c1.6-.1 2.8-1.4 2.8-3V7.5h-1V6.2Z" />
                      <path class="icon-fill" d="M10.8 14.1h2.4v3.1h-2.4v-3.1Z" />
                      <path class="icon-fill" d="M8.6 17.2h6.8l.9 2.4H7.7l.9-2.4Z" />
                      <path class="icon-shine" d="M9.5 6.2h4.8" />
                    </svg>
                  </span>
                  <strong>{{ runnerUp.name }}</strong>
                </li>
                <li v-if="thirdPlace">
                  <span class="podium-icon trophy bronze" aria-label="第 3 名">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path class="icon-fill" d="M7.2 4.4h9.6v4.1c0 3-1.8 5.2-4.8 6-3-.8-4.8-3-4.8-6V4.4Z" />
                      <path class="icon-fill" d="M6.9 6.2H3.7v1.5c0 2.8 2.1 5 5 5.2v-2.2c-1.6-.1-2.8-1.4-2.8-3V7.5h1V6.2Z" />
                      <path class="icon-fill" d="M17.1 6.2h3.2v1.5c0 2.8-2.1 5-5 5.2v-2.2c1.6-.1 2.8-1.4 2.8-3V7.5h-1V6.2Z" />
                      <path class="icon-fill" d="M10.8 14.1h2.4v3.1h-2.4v-3.1Z" />
                      <path class="icon-fill" d="M8.6 17.2h6.8l.9 2.4H7.7l.9-2.4Z" />
                      <path class="icon-shine" d="M9.5 6.2h4.8" />
                    </svg>
                  </span>
                  <strong>{{ thirdPlace.name }}</strong>
                </li>
                <li v-if="fourthPlace">
                  <span class="podium-icon medal" aria-label="第 4 名">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path class="icon-ribbon left" d="M7.5 3.5h3.2l1.3 6.2-3.1 2-1.4-8.2Z" />
                      <path class="icon-ribbon right" d="M13.3 3.5h3.2l-1.4 8.2-3.1-2 1.3-6.2Z" />
                      <circle class="icon-fill" cx="12" cy="15.2" r="5.2" />
                      <path class="icon-shine" d="M9.7 13.8c.5-.8 1.3-1.3 2.3-1.3" />
                      <path class="icon-mark" d="M12 12.7l.7 1.5 1.7.2-1.2 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.2 1.7-.2.7-1.5Z" />
                    </svg>
                  </span>
                  <strong>{{ fourthPlace.name }}</strong>
                </li>
              </ol>
            </div>

            <section v-if="thirdPlaceMatch" class="third-place-section">
              <div class="third-place-title">
                <span>3rd Place Match</span>
                <strong>第三名爭奪戰</strong>
              </div>
              <MatchCard
                :match="thirdPlaceMatch"
                :player-map="playerMap"
                @set-result="(...args) => emit('set-result', ...args)"
                @update-score="(...args) => emit('update-score', ...args)"
              />
            </section>
          </div>

          <svg class="connector-layer" aria-hidden="true">
            <polyline
              v-for="line in lines"
              :key="line.id"
              :points="line.points"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <div
            v-for="label in scoreLabels"
            :key="label.id"
            class="score-label"
            :style="{ left: `${label.x}px`, top: `${label.y}px` }"
          >
            {{ label.text }}
          </div>

          <div v-if="viewMode !== 'groups'" class="round-stack" :style="{ '--base-match-count': baseMatchCount }">
            <div
              v-for="(round, visualIndex) in displayRounds"
              :key="visualIndex"
              class="round-row"
            >
              <div
                v-for="match in round"
                :key="match.id"
                :ref="(el) => setMatchRef(match.id, el)"
                class="match-shell"
                :class="{ 'has-repechage': getRepechageMatchForMatch(match) }"
                :style="getMatchGridStyle(round.length, match.matchIndex)"
              >
                <div v-if="getMatchGroup(match)" class="group-marker">
                  {{ getMatchGroup(match).label }} 組
                  <span>{{ getMatchGroup(match).playerCount }} 人</span>
                </div>
                <MatchCard
                  :match="match"
                  :player-map="playerMap"
                  @set-result="(...args) => emit('set-result', ...args)"
                  @update-score="(...args) => emit('update-score', ...args)"
                />
                <div v-if="getRepechageMatchForMatch(match)" class="repechage-branch">
                  <div class="repechage-branch-title">敗部復活</div>
                  <MatchCard
                    :match="getRepechageMatchForMatch(match)"
                    :player-map="playerMap"
                    @set-result="(...args) => emit('set-result', ...args)"
                    @update-score="(...args) => emit('update-score', ...args)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-else class="grouped-board">
            <div class="group-tabs" aria-label="分組切換">
              <button
                v-for="tab in groupTabs"
                :key="tab.value"
                type="button"
                :class="{ active: activeGroupTab === tab.value }"
                @click="setGroupTab(tab.value)"
              >
                {{ tab.label }}
              </button>
            </div>

            <section
              v-if="activeGroupedSection && activeGroupTab !== 'final'"
              class="group-section"
            >
              <div class="group-title">
                <strong>{{ activeGroupedSection.label }} 組</strong>
                <span>{{ activeGroupedSection.playerCount }} 人</span>
              </div>
              <div
                class="round-stack group-round-stack"
                :style="{ '--base-match-count': activeGroupedSection.baseMatchCount }"
              >
                <div
                  v-for="(round, visualIndex) in activeGroupedSection.rounds"
                  :key="`${activeGroupedSection.label}-${visualIndex}`"
                  class="round-row"
                >
                  <div
                    v-for="(match, matchIndex) in round"
                    :key="match.id"
                    :ref="(el) => setMatchRef(match.id, el)"
                    class="match-shell"
                    :class="{ 'has-repechage': getRepechageMatchForMatch(match) }"
                    :style="getGroupMatchGridStyle(activeGroupedSection, round.length, matchIndex)"
                  >
                    <MatchCard
                      :match="match"
                      :player-map="playerMap"
                      @set-result="(...args) => emit('set-result', ...args)"
                      @update-score="(...args) => emit('update-score', ...args)"
                    />
                    <div v-if="getRepechageMatchForMatch(match)" class="repechage-branch">
                      <div class="repechage-branch-title">敗部復活</div>
                      <MatchCard
                        :match="getRepechageMatchForMatch(match)"
                        :player-map="playerMap"
                        @set-result="(...args) => emit('set-result', ...args)"
                        @update-score="(...args) => emit('update-score', ...args)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section v-if="activeGroupTab === 'final' && finalRounds.length" class="final-section">
              <div class="group-title final-title">
                <strong>總決賽區</strong>
                <span>{{ bracketGroups.length }} 組晉級</span>
              </div>
              <div class="round-stack" :style="{ '--base-match-count': finalBaseMatchCount }">
                <div
                  v-for="(round, visualIndex) in [...finalRounds].reverse()"
                  :key="`final-${visualIndex}`"
                  class="round-row"
                >
                  <div
                    v-for="(match, matchIndex) in round"
                    :key="match.id"
                    :ref="(el) => setMatchRef(match.id, el)"
                    class="match-shell"
                    :class="{ 'has-repechage': getRepechageMatchForMatch(match) }"
                    :style="getFinalMatchGridStyle(round.length, matchIndex)"
                  >
                    <MatchCard
                      :match="match"
                      :player-map="playerMap"
                      @set-result="(...args) => emit('set-result', ...args)"
                      @update-score="(...args) => emit('update-score', ...args)"
                    />
                    <div v-if="getRepechageMatchForMatch(match)" class="repechage-branch">
                      <div class="repechage-branch-title">敗部復活</div>
                      <MatchCard
                        :match="getRepechageMatchForMatch(match)"
                        :player-map="playerMap"
                        @set-result="(...args) => emit('set-result', ...args)"
                        @update-score="(...args) => emit('update-score', ...args)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="showRepechagePrompt"
        class="modal-backdrop repechage-modal-backdrop"
        @click.self="dismissRepechagePrompt"
      >
        <section class="modal-panel compact repechage-prompt-modal" role="dialog" aria-modal="true">
          <header class="modal-header">
            <div>
              <span class="repechage-prompt-kicker">第一輪已完成</span>
              <h2>是否使用敗部復活？</h2>
            </div>
            <button type="button" class="icon-button" aria-label="關閉" @click="dismissRepechagePrompt">
              ×
            </button>
          </header>

          <div class="repechage-prompt-body">
            <p>
              目前賽程偵測到同一支線原本會連續輪空，建議依照設定名額，把第一輪敗者安插到第一輪後面的空位。
            </p>
            <div class="repechage-prompt-summary">
              <span>需要 {{ repechageRequiredPlayerCount }} 位第一輪敗者</span>
              <strong>{{ repechageTargets.length }} 個安插位置</strong>
            </div>
          </div>

          <div class="stage-actions">
            <button type="button" class="primary-action" @click="openRepechageManagerFromPrompt">
              使用敗部復活
            </button>
            <button type="button" class="secondary-action" @click="dismissRepechagePrompt">
              這次不用
            </button>
          </div>
        </section>
      </div>

      <div
        v-if="showRepechageManager"
        class="modal-backdrop repechage-modal-backdrop"
        @click.self="showRepechageManager = false"
      >
        <section class="modal-panel compact repechage-modal" role="dialog" aria-modal="true">
          <header class="modal-header">
            <h2>敗部復活管理</h2>
            <button type="button" class="icon-button" aria-label="關閉" @click="showRepechageManager = false">
              ×
            </button>
          </header>

          <div class="repechage-modal-body">
            <div class="repechage-status-card">
              <span>需求</span>
              <strong v-if="repechageTargets.length">
                {{ repechageRequiredPlayerCount }} 人 / {{ repechageTargets.length }} 個位置
              </strong>
              <strong v-else>無需啟動</strong>
              <p v-if="repechageTargets.length">
                第一輪完成後，從敗者池挑選復活者，直接安插到第一輪後面的空位。
              </p>
              <p v-else>目前賽程沒有連續輪空兩次的支線。</p>
            </div>

            <div v-if="repechageTargets.length" class="repechage-status-card">
              <span>第一輪進度</span>
              <strong>{{ firstRoundState.completed }} / {{ firstRoundState.total }}</strong>
              <p>{{ firstRoundState.complete ? '第一輪已完成，可以設定敗部復活。' : '請先完成所有第一輪可比賽場次。' }}</p>
            </div>

            <template v-if="repechageTargets.length && firstRoundState.complete">
              <div v-if="repechageSelectionMode === 'manual'" class="repechage-manual-list">
                <div class="repechage-list-header">
                  <strong>手動指定復活名單</strong>
                  <span>已選 {{ manualRepechageSelection.length }} / {{ repechageRequiredPlayerCount }}</span>
                </div>
                <button
                  v-for="player in repechageCandidates"
                  :key="player.id"
                  type="button"
                  class="repechage-candidate"
                  :class="{ active: manualRepechageSelection.includes(player.id) }"
                  :disabled="
                    repechageStarted ||
                    (!manualRepechageSelection.includes(player.id) &&
                      manualRepechageSelection.length >= repechageRequiredPlayerCount)
                  "
                  @click="toggleManualRepechagePlayer(player.id)"
                >
                  <span>#{{ player.seed }}</span>
                  <strong>{{ player.name }}</strong>
                </button>
              </div>

              <div v-if="repechageMatches.length" class="repechage-pairings">
                <div class="repechage-list-header">
                  <strong>安插名單</strong>
                  <span>已建立</span>
                </div>
                <div v-for="match in repechageMatches" :key="match.id" class="repechage-pairing-row">
                  <span>{{ playerMap[match.playerA]?.name }}</span>
                  <strong>→</strong>
                  <span>第一輪後空位</span>
                </div>
              </div>

              <div class="stage-actions">
                <button
                  type="button"
                  class="primary-action"
                  :disabled="
                    repechageStarted ||
                    (repechageSelectionMode === 'manual' &&
                      manualRepechageSelection.length !== repechageRequiredPlayerCount)
                  "
                  @click="configureRepechage"
                >
                  {{ repechageSelectionMode === 'manual' ? '確認指定並安插' : '隨機安插復活名單' }}
                </button>
                <button
                  type="button"
                  class="secondary-action"
                  :disabled="repechageStarted || !repechageMatches.length"
                  @click="resetRepechage"
                >
                  重新選擇
                </button>
              </div>
            </template>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
