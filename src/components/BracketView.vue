<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import MatchCard from './MatchCard.vue'
import { deriveRounds, getChampionId, getPlayerMap } from '../composables/useBracketEngine'
import { usePanZoom } from '../composables/usePanZoom'

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

const rounds = computed(() => deriveRounds(props.bracket))
const displayRounds = computed(() => [...rounds.value].reverse())
const playerMap = computed(() => getPlayerMap(props.bracket.players))
const champion = computed(() => playerMap.value[getChampionId(props.bracket)] ?? null)
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
  rounds.value.forEach((round, roundIndex) => {
    if (roundIndex === rounds.value.length - 1) return
    round.forEach((match) => {
      const parent = rounds.value[roundIndex + 1]?.[Math.floor(match.matchIndex / 2)]
      if (!parent) return
      const childRect = getRect(match.id)
      const parentRect = getRect(parent.id)
      if (!childRect || !parentRect) return

      const x1 = childRect.x + childRect.width / 2
      const y1 = childRect.y
      const x2 = parentRect.x + parentRect.width / 2
      const y2 = parentRect.y + parentRect.height
      const midY = y1 - Math.max(24, (y1 - y2) / 2)
      nextLines.push({
        id: `${match.id}-${parent.id}`,
        points: `${x1},${y1} ${x1},${midY} ${x2},${midY} ${x2},${y2}`,
      })
      if (match.result && (match.result.scoreA !== null || match.result.scoreB !== null)) {
        nextScoreLabels.push({
          id: `${match.id}-score`,
          x: (x1 + x2) / 2,
          y: midY - 10,
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
  () => [props.bracket.id, props.bracket.slots.length],
  () => fitToView(),
  { flush: 'post' },
)
useResizeObserver(boardRef, updateLines)
useResizeObserver(viewportRef, fitToView)
onMounted(async () => {
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
      <div class="board-controls">
        <div class="zoom-controls" aria-label="縮放控制">
          <button type="button" @click="zoomOut">縮小</button>
          <span>{{ zoomPercent }}</span>
          <button type="button" @click="zoomIn">放大</button>
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
        <section ref="boardRef" class="bracket-board">
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

          <div class="round-stack">
            <div
              v-for="(round, visualIndex) in displayRounds"
              :key="visualIndex"
              class="round-row"
              :style="{ '--match-count': round.length }"
            >
              <div
                v-for="match in round"
                :key="match.id"
                :ref="(el) => setMatchRef(match.id, el)"
                class="match-shell"
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
    </div>
  </section>
</template>
