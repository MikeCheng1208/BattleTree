<script setup>
import { computed, ref } from 'vue'
import MatchCard from './MatchCard.vue'
import PrelimCrossTable from './PrelimCrossTable.vue'
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
const displayMode = ref('cards')
const selectedGroup = ref('all')

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
    playerIds: props.bracket.prelim.groups[group.groupIndex].playerIds,
    matches: matches.value.filter((match) => match.groupIndex === group.groupIndex),
  })),
)
const visibleGroups = computed(() =>
  selectedGroup.value === 'all'
    ? groupViews.value
    : groupViews.value.filter((group) => String(group.groupIndex) === selectedGroup.value),
)
const qualificationRule = computed(() => {
  const { knockoutSize, runnerUpCount } = qualification.value
  const groupCount = standings.value.length
  if (runnerUpCount === groupCount) return `各組前 2 名晉級 ${knockoutSize} 強淘汰賽`
  if (runnerUpCount > 0) return `各組第 1 名＋成績最佳的第 2 名 ${runnerUpCount} 位晉級 ${knockoutSize} 強淘汰賽`
  return `各組第 1 名晉級 ${knockoutSize} 強淘汰賽`
})

function onSetResult(matchId, winnerSlot, scores) {
  if (props.locked) return
  emit('set-result', matchId, winnerSlot, scores)
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

    <div class="prelim-view-controls">
      <div class="prelim-display-control" role="group" aria-label="呈現方式">
        <span>呈現方式</span>
        <button type="button" :class="{ active: displayMode === 'cards' }" :aria-pressed="displayMode === 'cards'" @click="displayMode = 'cards'">對戰卡</button>
        <button type="button" :class="{ active: displayMode === 'table' }" :aria-pressed="displayMode === 'table'" @click="displayMode = 'table'">交叉對戰表</button>
      </div>
      <label class="prelim-group-filter">
        小組
        <select v-model="selectedGroup">
          <option value="all">全部</option>
          <option v-for="group in groupViews" :key="group.groupIndex" :value="String(group.groupIndex)">{{ group.label }} 組</option>
        </select>
      </label>
    </div>

    <div class="prelim-groups" :class="{ 'cross-table-mode': displayMode === 'table' }">
      <article v-for="group in visibleGroups" :key="group.label" class="prelim-group-card">
        <h3>{{ group.label }} 組</h3>
        <div v-if="displayMode === 'cards'" class="prelim-matches">
          <MatchCard
            v-for="match in group.matches"
            :key="match.id"
            :match="match"
            :player-map="playerMap"
            @set-result="onSetResult"
            @update-score="onUpdateScore"
          />
        </div>
        <PrelimCrossTable
          v-else
          :player-ids="group.playerIds"
          :matches="group.matches"
          :player-map="playerMap"
          :locked="locked"
          @set-result="onSetResult"
          @update-score="onUpdateScore"
        />
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
