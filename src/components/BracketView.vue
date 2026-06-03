<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import MatchCard from './MatchCard.vue'
import { deriveRounds, getBracketGroups, getChampionId, getPlayerMap } from '../composables/useBracketEngine'
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

const emit = defineEmits(['set-result', 'update-score', 'reshuffle'])

const viewportRef = ref(null)
const contentRef = ref(null)
const boardRef = ref(null)
const matchRefs = ref({})
const lines = ref([])
const scoreLabels = ref([])
const viewMode = ref('ladder')
const activeGroupTab = ref('group-0')

const rounds = computed(() => deriveRounds(props.bracket))
const displayRounds = computed(() => (viewMode.value === 'ladder' ? [...rounds.value].reverse() : rounds.value))
const baseMatchCount = computed(() => Math.max(1, rounds.value[0]?.length ?? 1))
const bracketGroups = computed(() => getBracketGroups(props.bracket))
const availableViewModes = computed(() =>
  bracketGroups.value.length > 1 ? VIEW_MODES : VIEW_MODES.filter((mode) => mode.value !== 'groups'),
)
const playerMap = computed(() => getPlayerMap(props.bracket.players))
const champion = computed(() => playerMap.value[getChampionId(props.bracket)] ?? null)
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
      </div>

      <div ref="contentRef" class="bracket-panzoom-content" :style="transformStyle">
        <section ref="boardRef" class="bracket-board" :class="`view-${viewMode}`">
          <div class="champion-strip" :class="{ empty: !champion }">
            <span>Champion</span>
            <strong>{{ champion?.name ?? '尚未產生' }}</strong>
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
  </section>
</template>
