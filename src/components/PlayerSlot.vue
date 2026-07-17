<script setup>
defineProps({
  player: Object,
  side: {
    type: Number,
    required: true,
  },
  isWinner: Boolean,
  isLoser: Boolean,
  canWin: Boolean,
  isRepechageEntry: Boolean,
})

defineEmits(['win'])
</script>

<template>
  <div class="player-slot" :class="{ winner: isWinner, loser: isLoser, empty: !player, repechage: isRepechageEntry }">
    <div v-if="player" class="player-meta">
      <span class="seed">#{{ player.seed }}</span>
      <strong>{{ player.displayName ?? player.name }}</strong>
    </div>
    <div v-else class="player-meta muted">
      <span class="seed">BYE</span>
      <strong>輪空</strong>
    </div>
    <button v-if="player && canWin" type="button" class="win-button" title="晉級" @click="$emit('win', side)">
      ✓
    </button>
  </div>
</template>
