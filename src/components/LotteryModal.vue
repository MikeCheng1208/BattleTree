<script setup>
import { computed } from 'vue'
import { useLottery } from '../composables/useLottery'

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['close', 'update-lottery'])

const bracketRef = computed(() => props.bracket)
const {
  currentHighlightId,
  winnerId,
  isRolling,
  playerMap,
  filterOptions,
  candidatePool,
  previewPool,
  excludedIds,
  setFilter,
  toggleCandidate,
  confirmPool,
  resetPool,
  drawOne,
} = useLottery(bracketRef, (lottery) => emit('update-lottery', lottery))

const lottery = computed(() => props.bracket.lottery)
const activePool = computed(() => lottery.value.pool ?? [])
const drawn = computed(() => lottery.value.drawn ?? [])
const displayId = computed(() => winnerId.value || currentHighlightId.value || activePool.value[0] || null)
const stageClass = computed(() => ({
  rolling: isRolling.value,
  settled: Boolean(winnerId.value) && !isRolling.value,
}))
</script>

<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <section class="modal-panel lottery-panel">
      <header class="modal-header">
        <h2>抽籤</h2>
        <button type="button" class="icon-button" @click="$emit('close')">×</button>
      </header>

      <div v-if="!lottery.confirmed" class="lottery-setup">
        <section class="lottery-filter-panel">
          <header>
            <span>抽選範圍</span>
            <strong>{{ previewPool.length }} 人可抽</strong>
          </header>
          <div class="filter-row">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              :class="{ active: lottery.poolFilter === option.value }"
              @click="setFilter(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <div class="lottery-setup-layout">
          <section class="confirm-list">
            <header>
              <strong>名單預覽</strong>
              <span>{{ previewPool.length }} 人</span>
            </header>
            <div class="name-grid setup-preview-grid">
              <button
                v-for="id in candidatePool"
                :key="id"
                type="button"
                class="lottery-name setup-preview-card"
                :class="{ unchecked: excludedIds.has(id) }"
                :aria-pressed="!excludedIds.has(id)"
                @click="toggleCandidate(id)"
              >
                <span class="check-mark" aria-hidden="true"></span>
                <span>#{{ playerMap[id]?.seed }}</span>
                <strong>{{ playerMap[id]?.name }}</strong>
              </button>
            </div>
          </section>

          <aside class="lottery-ready-card">
            <span>Ready to draw</span>
            <strong>{{ previewPool.length }}</strong>
            <p>確認名單後會進入翻牌抽選舞台。</p>
            <button type="button" class="primary-action" :disabled="!previewPool.length" @click="confirmPool">
              確認，開始抽
            </button>
          </aside>
        </div>
      </div>

      <div v-else class="lottery-stage">
        <div class="lottery-status-bar">
          <div>
            <span>抽選池</span>
            <strong>{{ activePool.length }} 人</strong>
          </div>
          <div>
            <span>狀態</span>
            <strong v-if="winnerId">抽中 {{ playerMap[winnerId]?.name }}</strong>
            <strong v-else-if="isRolling">洗牌中</strong>
            <strong v-else>準備抽籤</strong>
          </div>
        </div>

        <div class="lottery-stage-layout">
          <div class="lottery-draw-area">
            <div class="lottery-card-stage" :class="stageClass">
              <div class="lottery-stage-glow" aria-hidden="true"></div>
              <div class="lottery-deck-burst" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div class="deck-stack" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div v-if="displayId" class="draw-focus-card" :class="{ winner: winnerId }">
                <span>#{{ playerMap[displayId]?.seed }}</span>
                <strong>{{ playerMap[displayId]?.name }}</strong>
              </div>

              <div v-if="winnerId" class="winner-confetti" aria-hidden="true">
                <span v-for="piece in 18" :key="piece"></span>
              </div>

              <div class="lottery-card-rail" aria-label="候選名單">
                <div
                  v-for="id in activePool"
                  :key="id"
                  class="lottery-name lottery-card"
                  :class="{ highlight: currentHighlightId === id, picked: winnerId === id }"
                  :style="{ '--card-index': activePool.indexOf(id), '--card-count': activePool.length }"
                >
                  <span>#{{ playerMap[id]?.seed }}</span>
                  <strong>{{ playerMap[id]?.name }}</strong>
                </div>
              </div>
            </div>

            <div class="stage-actions">
              <button type="button" class="primary-action" :disabled="!activePool.length || isRolling" @click="drawOne">
                {{ isRolling ? '抽籤中' : '抽一位' }}
              </button>
              <button type="button" class="secondary-action" :disabled="isRolling" @click="resetPool">重置抽籤</button>
            </div>
          </div>

          <div class="drawn-list">
            <header>
              <strong>已抽出</strong>
              <span>{{ drawn.length }} 人</span>
            </header>
            <ol v-if="drawn.length">
              <li v-for="(id, index) in drawn" :key="id">
                <span>{{ index + 1 }}</span>
                <strong>#{{ playerMap[id]?.seed }} {{ playerMap[id]?.name }}</strong>
              </li>
            </ol>
            <p v-else>尚未抽出名單</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
