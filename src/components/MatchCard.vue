<script setup>
import { computed } from 'vue'
import PlayerSlot from './PlayerSlot.vue'
import ScorePopover from './ScorePopover.vue'

const props = defineProps({
  match: {
    type: Object,
    required: true,
  },
  playerMap: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['set-result', 'update-score'])

const playerA = computed(() => props.playerMap[props.match.playerA] ?? null)
const playerB = computed(() => props.playerMap[props.match.playerB] ?? null)
const winnerSlot = computed(() => {
  if (!props.match.winnerId) return null
  return props.match.winnerId === props.match.playerA ? 0 : 1
})
const hasManualResult = computed(() => Boolean(props.match.result))
</script>

<template>
  <article
    class="match-card"
    :class="{ resolved: match.winnerId, bye: match.isBye, empty: match.isEmpty, repechage: match.isRepechage }"
  >
    <PlayerSlot
      :player="playerA"
      :side="0"
      :is-winner="winnerSlot === 0"
      :is-loser="winnerSlot === 1 && Boolean(playerA)"
      :can-win="match.isPlayable"
      :is-repechage-entry="match.isRepechagePlayerA"
      @win="emit('set-result', match.id, 0)"
    />
    <PlayerSlot
      :player="playerB"
      :side="1"
      :is-winner="winnerSlot === 1"
      :is-loser="winnerSlot === 0 && Boolean(playerB)"
      :can-win="match.isPlayable"
      :is-repechage-entry="match.isRepechagePlayerB"
      @win="emit('set-result', match.id, 1)"
    />
    <ScorePopover
      v-if="hasManualResult"
      :result="match.result"
      :placeholder-a="playerA ? `#${playerA.seed}` : '比分'"
      :placeholder-b="playerB ? `#${playerB.seed}` : '比分'"
      @save="(scoreA, scoreB) => emit('update-score', match.id, scoreA, scoreB)"
    />
  </article>
</template>
