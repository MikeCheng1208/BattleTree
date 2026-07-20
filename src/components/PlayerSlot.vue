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
  isAwaiting: Boolean,
  canEdit: Boolean,
})

defineEmits(['win', 'edit'])
</script>

<template>
  <div
    class="player-slot"
    :class="{ winner: isWinner, loser: isLoser, empty: !player && !isAwaiting, awaiting: isAwaiting, editable: canEdit }"
  >
    <button v-if="isAwaiting" type="button" class="player-meta awaiting-meta" @click="$emit('edit', side)">
      <span class="seed">?</span>
      <strong>待定</strong>
      <small>點擊填入</small>
    </button>
    <button v-else-if="canEdit" type="button" class="player-meta editable-meta" :class="{ muted: !player }" @click="$emit('edit', side)">
      <template v-if="player">
        <span class="seed">#{{ player.seed }}</span>
        <strong>{{ player.displayName ?? player.name }}</strong>
      </template>
      <template v-else>
        <span class="seed">BYE</span>
        <strong>輪空</strong>
      </template>
    </button>
    <div v-else-if="player" class="player-meta">
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
