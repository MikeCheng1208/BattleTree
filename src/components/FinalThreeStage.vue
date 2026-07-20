<script setup>
import { computed } from 'vue'
import MatchCard from './MatchCard.vue'

const props = defineProps({
  matches: {
    type: Array,
    required: true,
  },
  standings: {
    type: Array,
    required: true,
  },
  playerMap: {
    type: Object,
    required: true,
  },
  complete: Boolean,
})

const emit = defineEmits(['set-result', 'update-score'])

const finalistsReady = computed(
  () => props.matches.length === 3 && props.matches.every((match) => match.isPlayable),
)
const finishedCount = computed(() => props.matches.filter((match) => match.winnerId).length)
const allWinnersRecorded = computed(() => props.matches.length === 3 && finishedCount.value === 3)
const statusText = computed(() => {
  if (!finalistsReady.value) return '等待三條淘汰分支各產生 1 名晉級者'
  if (!allWinnersRecorded.value) return `已完成 ${finishedCount.value} / 3 場`
  if (!props.complete) return '三人皆為 1 勝 1 敗，請補齊三場比分以計算排名'
  return '三強循環已完成，最終名次已產生'
})
</script>

<template>
  <section class="final-three-card" aria-labelledby="final-three-title">
    <header class="final-three-header">
      <div>
        <span>Final Three</span>
        <h2 id="final-three-title">三強循環決賽</h2>
      </div>
      <p>{{ statusText }}</p>
    </header>

    <div class="final-three-layout">
      <div class="final-three-matches" aria-label="三強循環賽程">
        <MatchCard
          v-for="match in matches"
          :key="match.id"
          :match="match"
          :player-map="playerMap"
          @set-result="(...args) => emit('set-result', ...args)"
          @update-score="(...args) => emit('update-score', ...args)"
        />
      </div>

      <div class="final-three-standings-wrap">
        <h3>三強排名</h3>
        <table class="prelim-standings final-three-standings">
          <thead>
            <tr>
              <th>名次</th>
              <th>選手</th>
              <th>勝-敗</th>
              <th>得失分</th>
              <th>總得分</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!standings.length">
              <td colspan="5" class="final-three-placeholder">三強產生後顯示排名</td>
            </tr>
            <tr
              v-for="row in standings"
              :key="row.playerId"
              :class="{ 'ranking-complete': complete }"
            >
              <td>{{ row.rank }}</td>
              <td class="prelim-standings-name">{{ playerMap[row.playerId]?.displayName }}</td>
              <td>{{ row.wins }}-{{ row.losses }}</td>
              <td>{{ row.diff > 0 ? `+${row.diff}` : row.diff }}</td>
              <td>{{ row.pointsFor }}</td>
            </tr>
          </tbody>
        </table>
        <p class="final-three-rule">
          排名依序比較：勝場、兩人同勝場時的直接對戰、得失分、總得分，完全相同時以選手編號排序。
        </p>
      </div>
    </div>
  </section>
</template>
