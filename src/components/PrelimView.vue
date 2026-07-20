<script setup>
import { computed } from 'vue'
import MatchCard from './MatchCard.vue'
import { getPlayerMap } from '../composables/useBracketEngine'
import { getPrelimMatches, getPrelimQualification, getPrelimStandings } from '../composables/usePrelimEngine'

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
  locked: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['set-result', 'update-score', 'generate-knockout', 'reshuffle', 'reopen'])

const playerMap = computed(() => getPlayerMap(props.bracket.players))
const matches = computed(() =>
  getPrelimMatches(props.bracket.prelim).map((match) => ({ ...match, isPlayable: !props.locked })),
)
const standings = computed(() => getPrelimStandings(props.bracket.prelim, props.bracket.players))
const qualification = computed(() => getPrelimQualification(props.bracket.prelim, props.bracket.players))
const finishedCount = computed(() => matches.value.filter((match) => match.winnerId).length)
const qualifiedIds = computed(() =>
  qualification.value.complete
    ? new Set(qualification.value.qualifiers.map((entry) => entry.playerId))
    : new Set(),
)
const groupViews = computed(() =>
  standings.value.map((group) => ({
    ...group,
    matches: matches.value.filter((match) => match.groupIndex === group.groupIndex),
  })),
)
const qualificationRule = computed(() => {
  const { knockoutSize, runnerUpCount } = qualification.value
  const groupCount = standings.value.length
  if (runnerUpCount === groupCount) return `各組前 2 名晉級 ${knockoutSize} 強淘汰賽`
  if (runnerUpCount > 0) return `各組第 1 名＋成績最佳的第 2 名 ${runnerUpCount} 位晉級 ${knockoutSize} 強淘汰賽`
  return `各組第 1 名晉級 ${knockoutSize} 強淘汰賽`
})

function onSetResult(matchId, winnerSlot) {
  if (props.locked) return
  emit('set-result', matchId, winnerSlot)
}

function onUpdateScore(matchId, scoreA, scoreB) {
  if (props.locked) return
  emit('update-score', matchId, scoreA, scoreB)
}
</script>

<template>
  <section class="prelim-view">
    <header class="prelim-header">
      <div class="prelim-header-copy">
        <strong>預賽階段（小組循環）</strong>
        <span>已完成 {{ finishedCount }} / {{ matches.length }} 場，{{ qualificationRule }}</span>
        <span v-if="locked" class="prelim-locked-note">淘汰賽已產生，預賽結果已鎖定</span>
      </div>
      <div class="prelim-header-actions">
        <template v-if="!locked">
          <button type="button" class="secondary-action" @click="emit('reshuffle')">重新分組抽籤</button>
          <button
            type="button"
            class="primary-action"
            :disabled="!qualification.complete"
            @click="emit('generate-knockout')"
          >
            {{ qualification.complete ? `產生 ${qualification.knockoutSize} 強淘汰賽` : '打完全部預賽即可產生淘汰賽' }}
          </button>
        </template>
        <button v-else type="button" class="secondary-action" @click="emit('reopen')">
          修改預賽（清除淘汰賽結果）
        </button>
      </div>
    </header>

    <div class="prelim-groups">
      <article v-for="group in groupViews" :key="group.label" class="prelim-group-card">
        <h3>{{ group.label }} 組</h3>
        <div class="prelim-matches">
          <MatchCard
            v-for="match in group.matches"
            :key="match.id"
            :match="match"
            :player-map="playerMap"
            @set-result="onSetResult"
            @update-score="onUpdateScore"
          />
        </div>
        <table class="prelim-standings">
          <thead>
            <tr>
              <th>名次</th>
              <th>選手</th>
              <th>勝-敗</th>
              <th>得失分</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in group.rows"
              :key="row.playerId"
              :class="{ qualified: qualifiedIds.has(row.playerId) }"
            >
              <td>{{ row.rank }}</td>
              <td class="prelim-standings-name">{{ playerMap[row.playerId]?.displayName }}</td>
              <td>{{ row.wins }}-{{ row.losses }}</td>
              <td>{{ row.diff > 0 ? `+${row.diff}` : row.diff }}</td>
              <td>
                <span v-if="qualifiedIds.has(row.playerId)" class="prelim-qualified-badge">晉級</span>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  </section>
</template>
