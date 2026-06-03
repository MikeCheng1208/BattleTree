<script setup>
import { computed, ref, watch } from 'vue'
import { validatePlayers } from '../composables/useBracketEngine'

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['set-player-count', 'update-player', 'set-pairing-mode', 'set-group-count', 'generate'])
const GROUP_OPTIONS = [1, 2, 4, 8]

const playerCount = ref(props.bracket.players.length)
const submitErrors = ref([])
const availableGroupOptions = computed(() =>
  GROUP_OPTIONS.filter((count) => count <= Math.floor(props.bracket.players.length / 2)),
)

watch(
  () => props.bracket.players.length,
  (count) => {
    playerCount.value = count
  },
)

const validationErrors = computed(() => validatePlayers(props.bracket.players))

function applyPlayerCount() {
  emit('set-player-count', playerCount.value)
}

function generate() {
  submitErrors.value = validationErrors.value
  if (!submitErrors.value.length) emit('generate')
}
</script>

<template>
  <section class="setup-panel">
    <div class="setup-grid">
      <label class="field">
        <span>參賽人數</span>
        <input
          v-model.number="playerCount"
          type="number"
          min="2"
          @change="applyPlayerCount"
        />
      </label>

      <div class="segmented" role="radiogroup" aria-label="配對方式">
        <button
          type="button"
          :class="{ active: bracket.pairingMode === 'order' }"
          @click="emit('set-pairing-mode', 'order')"
        >
          依序配對
        </button>
        <button
          type="button"
          :class="{ active: bracket.pairingMode === 'random' }"
          @click="emit('set-pairing-mode', 'random')"
        >
          隨機抽籤
        </button>
      </div>

      <div class="segmented" role="radiogroup" aria-label="分組數">
        <button
          v-for="count in availableGroupOptions"
          :key="count"
          type="button"
          :class="{ active: bracket.groupCount === count }"
          @click="emit('set-group-count', count)"
        >
          {{ count === 1 ? '不分組' : `${count} 組` }}
        </button>
      </div>
    </div>

    <div class="player-editor">
      <div class="player-editor-head">
        <span>編號</span>
        <span>選手姓名</span>
      </div>
      <label v-for="player in bracket.players" :key="player.id" class="player-row">
        <span class="seed-display">#{{ player.seed }}</span>
        <input
          :value="player.name"
          type="text"
          @input="emit('update-player', player.id, { name: $event.target.value })"
        />
      </label>
    </div>

    <ul v-if="submitErrors.length" class="error-list">
      <li v-for="error in submitErrors" :key="error">{{ error }}</li>
    </ul>

    <button type="button" class="primary-action" @click="generate">產生對戰表</button>
  </section>
</template>
