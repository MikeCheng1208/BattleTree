<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import MatchCard from './MatchCard.vue'
import SlotEditor from './SlotEditor.vue'
import {
  deriveRounds,
  getBracketGroups,
  getFirstRoundState,
  getPlayerMap,
  getPodium,
  sanitizeResults,
  THIRD_PLACE_MATCH_ID,
} from '../composables/useBracketEngine'
import { usePanZoom } from '../composables/usePanZoom'

const VIEW_MODES = [
  { value: 'ladder', label: '標準' },
  { value: 'columns', label: '橫向' },
  { value: 'mirror', label: '對稱' },
  { value: 'groups', label: '分組' },
]

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
  initialViewState: Object,
})

const emit = defineEmits([
  'set-result',
  'update-score',
  'reshuffle',
  'fill-free-slot',
  'add-free-player',
  'clear-free-slot',
  'confirm-free-bye',
  'revoke-free-bye',
  'random-fill-free-slots',
  'confirm-all-byes',
])

const viewportRef = ref(null)
const contentRef = ref(null)
const boardRef = ref(null)
const matchRefs = ref({})
const lines = ref([])
const scoreLabels = ref([])
const viewMode = ref('ladder')
const activeGroupTab = ref('group-0')
const slotEditorIndex = ref(null)

const rounds = computed(() => deriveRounds(props.bracket))
const displayRounds = computed(() => (viewMode.value === 'ladder' ? [...rounds.value].reverse() : rounds.value))
const baseMatchCount = computed(() => Math.max(1, rounds.value[0]?.length ?? 1))
const halfMatchCount = computed(() => Math.max(1, baseMatchCount.value / 2))
const mirrorColumns = computed(() => {
  const rs = rounds.value
  if (rs.length < 2) return []
  const finalMatch = rs[rs.length - 1][0]
  const body = rs.slice(0, rs.length - 1)
  const left = body.map((round, index) => ({
    key: `L${index}`,
    side: 'left',
    matches: round.slice(0, round.length / 2),
  }))
  const right = body.map((round, index) => ({
    key: `R${index}`,
    side: 'right',
    matches: round.slice(round.length / 2),
  }))
  return [...left, { key: 'final', side: 'final', matches: [finalMatch] }, ...right.reverse()]
})
const bracketGroups = computed(() => getBracketGroups(props.bracket))
const availableViewModes = computed(() =>
  VIEW_MODES.filter((mode) => {
    if (mode.value === 'groups') return bracketGroups.value.length > 1
    if (mode.value === 'mirror') return bracketGroups.value.length <= 1 && baseMatchCount.value >= 2
    return true
  }),
)
const playerMap = computed(() => getPlayerMap(props.bracket.players))
const podium = computed(() => getPodium(props.bracket))
const champion = computed(() => playerMap.value[podium.value.championId] ?? null)
const runnerUp = computed(() => playerMap.value[podium.value.runnerUpId] ?? null)
const thirdPlace = computed(() => playerMap.value[podium.value.thirdPlaceId] ?? null)
const fourthPlace = computed(() => playerMap.value[podium.value.fourthPlaceId] ?? null)
const thirdPlaceMatch = computed(() => podium.value.thirdPlaceMatch)
const firstRoundState = computed(() => getFirstRoundState(props.bracket))
const upcomingMatches = computed(() => {
  const list = rounds.value.flat().filter((match) => match.isPlayable && !match.winnerId)
  const third = thirdPlaceMatch.value
  if (third && !third.winnerId) list.push(third)
  return list
})
const canFocusNext = computed(() => upcomingMatches.value.length > 0)
const focusedMatchIds = ref([])
let focusPulseTimer = null
const isFree = computed(() => props.bracket.format === 'free')
const byeSet = computed(() => new Set(props.bracket.byeSlots ?? []))
const awaitingSlotIndexes = computed(() =>
  isFree.value
    ? props.bracket.slots.flatMap((slot, index) => (slot === null && !byeSet.value.has(index) ? [index] : []))
    : [],
)
const assignedIdCounts = computed(() => {
  const counts = new Map()
  props.bracket.slots.forEach((id) => {
    if (typeof id === 'string') counts.set(id, (counts.get(id) ?? 0) + 1)
  })
  return counts
})
const unassignedPlayers = computed(() =>
  props.bracket.players.filter((player) => !assignedIdCounts.value.has(player.id)),
)
const loserCandidates = computed(() =>
  firstRoundState.value.loserIds
    .filter((id) => (assignedIdCounts.value.get(id) ?? 0) < 2)
    .map((id) => playerMap.value[id])
    .filter(Boolean),
)
const slotEditorPlayer = computed(() =>
  slotEditorIndex.value === null ? null : (playerMap.value[props.bracket.slots[slotEditorIndex.value]] ?? null),
)
const slotEditorIsConfirmedBye = computed(
  () => slotEditorIndex.value !== null && byeSet.value.has(slotEditorIndex.value),
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
  getViewState: getPanZoomViewState,
  restoreViewState: restorePanZoomViewState,
  fitToView,
  focusRect,
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

function getMirrorMatchGridStyle(column, localIndex) {
  if (column.side === 'final') return {}
  const span = Math.max(1, halfMatchCount.value / Math.max(1, column.matches.length))
  return {
    gridRow: `${Math.floor(localIndex * span) + 1} / span ${Math.floor(span)}`,
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

function openSlotEditor(slotIndex) {
  if (!isFree.value) return
  slotEditorIndex.value = slotIndex
}

function closeSlotEditor() {
  slotEditorIndex.value = null
}

function countClearedResults(candidateBracket) {
  const sanitized = sanitizeResults(candidateBracket)
  return Object.keys(props.bracket.results ?? {}).filter((id) => !sanitized[id]).length
}

function buildSlotCandidate(slotIndex, playerId) {
  const slots = [...props.bracket.slots]
  const hadPlayer = slots[slotIndex] !== null
  slots[slotIndex] = playerId
  const results = { ...props.bracket.results }
  if (hadPlayer || playerId === null) delete results[`r0-m${Math.floor(slotIndex / 2)}`]
  return {
    ...props.bracket,
    slots,
    results,
    byeSlots: (props.bracket.byeSlots ?? []).filter((index) => index !== slotIndex),
  }
}

function confirmSlotChange(candidateBracket, actionLabel) {
  const cleared = countClearedResults(candidateBracket)
  if (!cleared) return true
  return confirm(`${actionLabel}將清除 ${cleared} 場已完成場次的成績，確定繼續？`)
}

function handleSlotFill(playerId) {
  const index = slotEditorIndex.value
  if (index === null) return
  if (!confirmSlotChange(buildSlotCandidate(index, playerId), '更換這個格位的選手')) return
  emit('fill-free-slot', index, playerId)
  closeSlotEditor()
}

function handleSlotCreate(payload) {
  const index = slotEditorIndex.value
  if (index === null) return
  if (!confirmSlotChange(buildSlotCandidate(index, '__pending__'), '更換這個格位的選手')) return
  emit('add-free-player', index, payload)
  closeSlotEditor()
}

function handleSlotClear() {
  const index = slotEditorIndex.value
  if (index === null) return
  if (!confirmSlotChange(buildSlotCandidate(index, null), '清空這個格位')) return
  emit('clear-free-slot', index)
  closeSlotEditor()
}

function handleSlotConfirmBye() {
  const index = slotEditorIndex.value
  if (index === null) return
  emit('confirm-free-bye', index)
  closeSlotEditor()
}

function handleSlotRevokeBye() {
  const index = slotEditorIndex.value
  if (index === null) return
  const candidate = {
    ...props.bracket,
    byeSlots: (props.bracket.byeSlots ?? []).filter((item) => item !== index),
  }
  if (!confirmSlotChange(candidate, '取消輪空')) return
  emit('revoke-free-bye', index)
  closeSlotEditor()
}

function handleRandomFill() {
  emit('random-fill-free-slots')
}

function handleConfirmAllByes() {
  if (!confirm(`確定將剩餘 ${awaitingSlotIndexes.value.length} 個待定格全部視為輪空？對手將自動晉級。`)) return
  emit('confirm-all-byes')
  closeSlotEditor()
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

function getTabForMatch(match) {
  if (match.id === THIRD_PLACE_MATCH_ID) return activeGroupTab.value
  if (match.roundIndex >= groupRoundCount.value) return 'final'
  const slotIndex = match.matchIndex * 2 ** (match.roundIndex + 1)
  const index = bracketGroups.value.findIndex(
    (group) => slotIndex >= group.startSlot && slotIndex < group.startSlot + group.slotCount,
  )
  return `group-${Math.max(0, index)}`
}

async function focusNextMatches() {
  let targets = upcomingMatches.value.slice(0, 2)
  if (!targets.length) return

  if (viewMode.value === 'groups') {
    const firstTab = getTabForMatch(targets[0])
    targets = targets.filter((match) => getTabForMatch(match) === firstTab)
    if (activeGroupTab.value !== firstTab) {
      activeGroupTab.value = firstTab
      await nextTick()
      updateLines()
    }
  }

  const rects = targets
    .filter((match) => matchRefs.value[match.id]?.isConnected)
    .map((match) => ({ match, rect: getRect(match.id) }))
    .filter((item) => item.rect)
  if (!rects.length) return

  const viewportRect = viewportRef.value?.getBoundingClientRect()
  const unionOf = (items) => {
    const minX = Math.min(...items.map(({ rect }) => rect.x))
    const minY = Math.min(...items.map(({ rect }) => rect.y))
    const maxX = Math.max(...items.map(({ rect }) => rect.x + rect.width))
    const maxY = Math.max(...items.map(({ rect }) => rect.y + rect.height))
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  let focusItems = rects
  let union = unionOf(focusItems)
  // 兩場距離太遠時聚焦會縮到看不清，退回只聚焦下一場
  if (viewportRect && focusItems.length > 1) {
    const fitScale = Math.min(
      (viewportRect.width - 140) / union.width,
      (viewportRect.height - 140) / union.height,
    )
    if (fitScale < 0.4) {
      focusItems = rects.slice(0, 1)
      union = unionOf(focusItems)
    }
  }
  focusRect(union, { padding: 70, maxScale: 1 })

  clearTimeout(focusPulseTimer)
  focusedMatchIds.value = []
  await nextTick()
  focusedMatchIds.value = focusItems.map(({ match }) => match.id)
  focusPulseTimer = setTimeout(() => {
    focusedMatchIds.value = []
  }, 1800)
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

      if (viewMode.value === 'mirror') {
        const childOnLeft = match.matchIndex < round.length / 2
        const y1 = childRect.y + childRect.height / 2
        const y2 = parentRect.y + parentRect.height / 2
        let x1
        let x2
        let midX
        if (childOnLeft) {
          x1 = childRect.x + childRect.width
          x2 = parentRect.x
          midX = x1 + Math.max(28, (x2 - x1) / 2)
        } else {
          x1 = childRect.x
          x2 = parentRect.x + parentRect.width
          midX = x1 - Math.max(28, (x1 - x2) / 2)
        }
        nextLines.push({
          id: `${match.id}-${parent.id}`,
          points: `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`,
        })
        if (match.result && (match.result.scoreA !== null || match.result.scoreB !== null)) {
          nextScoreLabels.push({
            id: `${match.id}-score`,
            x: midX,
            y: (y1 + y2) / 2 - 10,
            text: `${match.result.scoreA ?? ''} : ${match.result.scoreB ?? ''}`,
          })
        }
        return
      }

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
watch(viewMode, updateLines, { flush: 'post' })
watch(bracketGroups, (groups) => {
  if (viewMode.value === 'groups' && groups.length <= 1) viewMode.value = 'ladder'
  if (viewMode.value === 'mirror' && groups.length > 1) viewMode.value = 'ladder'
  if (!groupTabs.value.some((tab) => tab.value === activeGroupTab.value)) {
    activeGroupTab.value = groupTabs.value[0]?.value ?? 'group-0'
  }
})
watch(
  () => props.bracket.slots.length,
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
  const savedViewMode = props.initialViewState?.viewMode
  viewMode.value = availableViewModes.value.some((mode) => mode.value === savedViewMode)
    ? savedViewMode
    : bracketGroups.value.length > 1
      ? 'groups'
      : 'ladder'
  const savedGroupTab = props.initialViewState?.activeGroupTab
  activeGroupTab.value = groupTabs.value.some((tab) => tab.value === savedGroupTab)
    ? savedGroupTab
    : groupTabs.value[0]?.value ?? 'group-0'
  const restored = await restorePanZoomViewState(props.initialViewState?.panZoom)
  if (!restored) await fitToView()
  updateLines()
})

defineExpose({
  getExportElement: () => boardRef.value,
  getViewState: () => ({
    viewMode: viewMode.value,
    activeGroupTab: activeGroupTab.value,
    panZoom: getPanZoomViewState(),
  }),
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
          <button type="button" :disabled="!canFocusNext" title="聚焦下一場比賽" @click="focusNextMatches">
            下一場
          </button>
        </div>
        <button
          v-if="bracket.pairingMode === 'random'"
          type="button"
          class="secondary-action"
          @click="emit('reshuffle')"
        >
          重新抽籤
        </button>
        <template v-if="isFree && awaitingSlotIndexes.length">
          <button
            type="button"
            class="secondary-action"
            :disabled="!loserCandidates.length"
            @click="handleRandomFill"
          >
            隨機填入敗者{{ loserCandidates.length ? `（可用 ${loserCandidates.length} 人）` : '' }}
          </button>
          <button type="button" class="secondary-action" @click="handleConfirmAllByes">
            剩餘 {{ awaitingSlotIndexes.length }} 格全部輪空
          </button>
        </template>
      </div>

      <button
        type="button"
        class="next-match-fab"
        :disabled="!canFocusNext"
        aria-label="下一場"
        @click="focusNextMatches"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5.8 11.4 12 5 18.2" />
          <path d="M12.6 5.8 19 12l-6.4 6.2" />
        </svg>
        <span class="next-match-fab-tip" aria-hidden="true">下一場</span>
      </button>

      <div ref="contentRef" class="bracket-panzoom-content" :style="transformStyle">
        <section ref="boardRef" class="bracket-board" :class="`view-${viewMode}`">
          <div class="finals-summary" :class="{ 'has-third-place': thirdPlaceMatch }">
            <div class="champion-strip" :class="{ empty: !champion }">
              <span>榮譽榜</span>
              <strong>{{ champion?.displayName ?? '尚未產生' }}</strong>
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
                  <strong>{{ champion.displayName }}</strong>
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
                  <strong>{{ runnerUp.displayName }}</strong>
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
                  <strong>{{ thirdPlace.displayName }}</strong>
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
                  <strong>{{ fourthPlace.displayName }}</strong>
                </li>
              </ol>
            </div>

            <section
              v-if="thirdPlaceMatch"
              :ref="(el) => setMatchRef(THIRD_PLACE_MATCH_ID, el)"
              class="third-place-section"
              :class="{ 'focus-pulse': focusedMatchIds.includes(THIRD_PLACE_MATCH_ID) }"
            >
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

          <div v-if="viewMode !== 'groups' && viewMode !== 'mirror'" class="round-stack" :style="{ '--base-match-count': baseMatchCount }">
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
                :class="{ 'focus-pulse': focusedMatchIds.includes(match.id) }"
                :style="getMatchGridStyle(round.length, match.matchIndex)"
              >
                <div v-if="getMatchGroup(match)" class="group-marker">
                  {{ getMatchGroup(match).label }} 組
                  <span>{{ getMatchGroup(match).playerCount }} 人</span>
                </div>
                <MatchCard
                  :match="match"
                  :player-map="playerMap"
                  :editable="isFree && match.roundIndex === 0"
                  @set-result="(...args) => emit('set-result', ...args)"
                  @update-score="(...args) => emit('update-score', ...args)"
                  @edit-slot="openSlotEditor"
                />
              </div>
            </div>
          </div>

          <div v-else-if="viewMode === 'mirror'" class="mirror-stack" :style="{ '--half-match-count': halfMatchCount }">
            <div
              v-for="column in mirrorColumns"
              :key="column.key"
              class="mirror-column"
              :class="`side-${column.side}`"
            >
              <div
                v-for="(match, localIndex) in column.matches"
                :key="match.id"
                :ref="(el) => setMatchRef(match.id, el)"
                class="match-shell"
                :class="{ 'focus-pulse': focusedMatchIds.includes(match.id) }"
                :style="getMirrorMatchGridStyle(column, localIndex)"
              >
                <MatchCard
                  :match="match"
                  :player-map="playerMap"
                  :editable="isFree && match.roundIndex === 0"
                  @set-result="(...args) => emit('set-result', ...args)"
                  @update-score="(...args) => emit('update-score', ...args)"
                  @edit-slot="openSlotEditor"
                />
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
                    :class="{ 'focus-pulse': focusedMatchIds.includes(match.id) }"
                    :style="getGroupMatchGridStyle(activeGroupedSection, round.length, matchIndex)"
                  >
                    <MatchCard
                      :match="match"
                      :player-map="playerMap"
                      @set-result="(...args) => emit('set-result', ...args)"
                      @update-score="(...args) => emit('update-score', ...args)"
                    />
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
                    :class="{ 'focus-pulse': focusedMatchIds.includes(match.id) }"
                    :style="getFinalMatchGridStyle(round.length, matchIndex)"
                  >
                    <MatchCard
                      :match="match"
                      :player-map="playerMap"
                      @set-result="(...args) => emit('set-result', ...args)"
                      @update-score="(...args) => emit('update-score', ...args)"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
    <SlotEditor
      v-if="slotEditorIndex !== null"
      :slot-index="slotEditorIndex"
      :current-player="slotEditorPlayer"
      :is-confirmed-bye="slotEditorIsConfirmedBye"
      :unassigned-players="unassignedPlayers"
      :loser-candidates="loserCandidates"
      :awaiting-slot-count="awaitingSlotIndexes.length"
      @fill="handleSlotFill"
      @create="handleSlotCreate"
      @clear="handleSlotClear"
      @confirm-bye="handleSlotConfirmBye"
      @confirm-all-byes="handleConfirmAllByes"
      @revoke-bye="handleSlotRevokeBye"
      @close="closeSlotEditor"
    />
  </section>
</template>
