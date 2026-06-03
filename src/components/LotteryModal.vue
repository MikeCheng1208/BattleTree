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
  previewPool,
  setFilter,
  confirmPool,
  resetPool,
  drawOne,
} = useLottery(bracketRef, (lottery) => emit('update-lottery', lottery))

const lottery = computed(() => props.bracket.lottery)
const activePool = computed(() => lottery.value.pool ?? [])
const drawn = computed(() => lottery.value.drawn ?? [])
</script>

<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <section class="modal-panel lottery-panel">
      <header class="modal-header">
        <h2>抽籤</h2>
        <button type="button" class="icon-button" @click="$emit('close')">×</button>
      </header>

      <div v-if="!lottery.confirmed" class="lottery-setup">
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

        <div class="confirm-list">
          <header>
            <strong>名單確認</strong>
            <span>{{ previewPool.length }} 人</span>
          </header>
          <div class="name-grid">
            <div v-for="id in previewPool" :key="id" class="lottery-name">
              <span>#{{ playerMap[id]?.seed }}</span>
              <strong>{{ playerMap[id]?.name }}</strong>
            </div>
          </div>
        </div>

        <button type="button" class="primary-action" :disabled="!previewPool.length" @click="confirmPool">
          確認，開始抽
        </button>
      </div>

      <div v-else class="lottery-stage">
        <div class="stage-header">
          <span>剩餘 {{ activePool.length }} 人</span>
          <strong v-if="winnerId">抽中：{{ playerMap[winnerId]?.name }}</strong>
          <strong v-else>準備抽籤</strong>
        </div>

        <div class="name-grid stage-grid">
          <div
            v-for="id in activePool"
            :key="id"
            class="lottery-name"
            :class="{ highlight: currentHighlightId === id, picked: winnerId === id }"
          >
            <span>#{{ playerMap[id]?.seed }}</span>
            <strong>{{ playerMap[id]?.name }}</strong>
          </div>
        </div>

        <div class="stage-actions">
          <button type="button" class="primary-action" :disabled="!activePool.length || isRolling" @click="drawOne">
            {{ isRolling ? '抽籤中' : '抽一位' }}
          </button>
          <button type="button" class="secondary-action" :disabled="isRolling" @click="resetPool">重置抽籤</button>
        </div>

        <aside class="drawn-list">
          <strong>已抽出</strong>
          <ol>
            <li v-for="(id, index) in drawn" :key="id">
              {{ index + 1 }}. #{{ playerMap[id]?.seed }} {{ playerMap[id]?.name }}
            </li>
          </ol>
        </aside>
      </div>
    </section>
  </div>
</template>
