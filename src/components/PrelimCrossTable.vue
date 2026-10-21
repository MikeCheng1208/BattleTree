<script setup>
import { computed, ref, watch } from 'vue'
import { getPrelimCrossTableCell, getPrelimMatchResultFromCell } from '../composables/usePrelimCrossTable.js'

const props = defineProps({
  playerIds: { type: Array, required: true },
  matches: { type: Array, required: true },
  playerMap: { type: Object, required: true },
  locked: Boolean,
})
const emit = defineEmits(['set-result', 'update-score'])

const cells = computed(() =>
  props.playerIds.map((_, rowIndex) =>
    props.playerIds.map((__, columnIndex) =>
      getPrelimCrossTableCell(props.playerIds, rowIndex, columnIndex, props.matches),
    ),
  ),
)
const selected = ref(null)
const rowScore = ref('')
const columnScore = ref('')
const tieWinner = ref('')
const isTie = computed(() => rowScore.value !== '' && columnScore.value !== '' && Number(rowScore.value) === Number(columnScore.value))

watch(() => props.locked, (locked) => {
  if (locked) selected.value = null
})

function playerName(id) {
  return props.playerMap[id]?.displayName ?? props.playerMap[id]?.name ?? id
}

function cellLabel(cell, rowPlayerId, columnPlayerId) {
  const score = cell.scoreRow == null || cell.scoreColumn == null
    ? '尚未輸入比分'
    : `${cell.scoreRow}:${cell.scoreColumn}`
  return `${playerName(rowPlayerId)} 對 ${playerName(columnPlayerId)}，${score}${props.locked ? '' : '，點擊編輯比分'}`
}

function openCell(cell, rowPlayerId, columnPlayerId) {
  if (props.locked || !cell) return
  selected.value = { ...cell, rowPlayerId, columnPlayerId }
  rowScore.value = cell.scoreRow ?? ''
  columnScore.value = cell.scoreColumn ?? ''
  tieWinner.value = cell.match.winnerId === rowPlayerId ? 'row' : cell.match.winnerId === columnPlayerId ? 'column' : ''
}

function validScore(value) {
  const number = Number(value)
  return value !== '' && Number.isInteger(number) && number >= 0
}

function saveScore() {
  const cell = selected.value
  if (props.locked || !cell || !validScore(rowScore.value) || !validScore(columnScore.value)) return

  const first = Number(rowScore.value)
  const second = Number(columnScore.value)
  if (first === second && !tieWinner.value) return
  const { winnerSlot, scoreA, scoreB } = getPrelimMatchResultFromCell(
    cell,
    first,
    second,
    tieWinner.value === 'row' ? cell.rowSlot : cell.columnSlot,
  )

  if (cell.match.result?.winnerSlot === winnerSlot) {
    emit('update-score', cell.match.id, scoreA, scoreB)
  } else {
    emit('set-result', cell.match.id, winnerSlot, { scoreA, scoreB })
  }
  selected.value = null
}
</script>

<template>
  <div class="prelim-cross-table-wrap">
    <table class="prelim-cross-table">
      <thead>
        <tr>
          <th scope="col">選手</th>
          <th v-for="playerId in playerIds" :key="playerId" scope="col">{{ playerName(playerId) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(rowPlayerId, rowIndex) in playerIds" :key="rowPlayerId">
          <th scope="row">{{ playerName(rowPlayerId) }}</th>
          <td
            v-for="(columnPlayerId, columnIndex) in playerIds"
            :key="columnPlayerId"
            :class="{ 'prelim-cross-table-inactive': !cells[rowIndex][columnIndex] }"
          >
            <button
              v-if="cells[rowIndex][columnIndex]"
              type="button"
              :disabled="locked"
              :aria-label="cellLabel(cells[rowIndex][columnIndex], rowPlayerId, columnPlayerId)"
              @click="openCell(cells[rowIndex][columnIndex], rowPlayerId, columnPlayerId)"
            >
              <template v-if="cells[rowIndex][columnIndex].scoreRow != null && cells[rowIndex][columnIndex].scoreColumn != null">
                {{ cells[rowIndex][columnIndex].scoreRow }}:{{ cells[rowIndex][columnIndex].scoreColumn }}
              </template>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <form v-if="selected && !locked" class="prelim-cross-editor" @submit.prevent="saveScore">
    <strong>{{ playerName(selected.rowPlayerId) }} 對 {{ playerName(selected.columnPlayerId) }}</strong>
    <div class="prelim-cross-editor-scores">
      <label>{{ playerName(selected.rowPlayerId) }}<input v-model="rowScore" type="number" min="0" step="1" required /></label>
      <span>:</span>
      <label>{{ playerName(selected.columnPlayerId) }}<input v-model="columnScore" type="number" min="0" step="1" required /></label>
    </div>
    <label v-if="isTie" class="prelim-cross-tie-winner">
      平手時的勝者
      <select v-model="tieWinner" required>
        <option value="" disabled>請選擇</option>
        <option value="row">{{ playerName(selected.rowPlayerId) }}</option>
        <option value="column">{{ playerName(selected.columnPlayerId) }}</option>
      </select>
    </label>
    <div class="prelim-cross-editor-actions">
      <button type="button" @click="selected = null">取消</button>
      <button type="submit" class="primary-action">儲存比分</button>
    </div>
  </form>
</template>
