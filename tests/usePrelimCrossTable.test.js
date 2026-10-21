import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPrelimCrossTableCell,
  getPrelimCrossTableSelectionCell,
  getPrelimMatchResultFromCell,
  isPrelimCrossTableSelectionCurrent,
} from '../src/composables/usePrelimCrossTable.js'
import { getPrelimMatches } from '../src/composables/usePrelimEngine.js'

test('交叉表每一組選手配對只對應上半部的一場既有比賽', () => {
  const playerIds = ['a', 'b', 'c', 'd']
  const matches = getPrelimMatches({ groups: [{ label: 'A', playerIds }], results: {} })
  const mappedIds = []

  for (let row = 0; row < playerIds.length; row += 1) {
    for (let column = 0; column < playerIds.length; column += 1) {
      const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
      if (row >= column) {
        assert.equal(cell, null, `${row},${column} 應不可編輯`)
      } else {
        assert.ok(cell, `${row},${column} 應有比賽`)
        assert.deepEqual(new Set([cell.match.playerA, cell.match.playerB]), new Set([playerIds[row], playerIds[column]]))
        assert.equal(cell.scoreRow, null)
        assert.equal(cell.scoreColumn, null)
        mappedIds.push(cell.match.id)
      }
    }
  }

  assert.deepEqual(new Set(mappedIds), new Set(matches.map((match) => match.id)))
  assert.equal(mappedIds.length, matches.length)
})

test('比分依列選手在前顯示，排程儲存的選手順序相反時也正確', () => {
  const playerIds = ['a', 'b', 'c', 'd']
  const prelim = { groups: [{ label: 'A', playerIds }], results: {} }
  const initial = getPrelimMatches(prelim)
  const reversed = initial.find((match) => match.playerA === 'd' && match.playerB === 'b')
  const forward = initial.find((match) => match.playerA === 'a' && match.playerB === 'd')
  assert.ok(reversed)
  assert.ok(forward)
  prelim.results[reversed.id] = { winnerSlot: 1, scoreA: 1, scoreB: 2 }
  prelim.results[forward.id] = { winnerSlot: 0, scoreA: 3, scoreB: 0 }
  const matches = getPrelimMatches(prelim)

  const bVsD = getPrelimCrossTableCell(playerIds, 1, 3, matches)
  assert.equal(bVsD.match.id, reversed.id)
  assert.equal(bVsD.rowSlot, 1)
  assert.equal(bVsD.columnSlot, 0)
  assert.equal(bVsD.scoreRow, 2)
  assert.equal(bVsD.scoreColumn, 1)
  assert.deepEqual(getPrelimMatchResultFromCell(bVsD, 4, 2), {
    winnerSlot: 1,
    scoreA: 2,
    scoreB: 4,
  })
  assert.deepEqual(getPrelimMatchResultFromCell(bVsD, 2, 2, bVsD.columnSlot), {
    winnerSlot: 0,
    scoreA: 2,
    scoreB: 2,
  })

  const aVsD = getPrelimCrossTableCell(playerIds, 0, 3, matches)
  assert.equal(aVsD.match.id, forward.id)
  assert.equal(aVsD.rowSlot, 0)
  assert.equal(aVsD.scoreRow, 3)
  assert.equal(aVsD.scoreColumn, 0)
  assert.deepEqual(getPrelimMatchResultFromCell(aVsD, 1, 3), {
    winnerSlot: 1,
    scoreA: 1,
    scoreB: 3,
  })
})

// 與 PrelimCrossTable.vue 的 openCell 相同：selected 是格子加上列、欄選手
function selectCell(playerIds, row, column, matches) {
  const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
  return { ...cell, rowPlayerId: playerIds[row], columnPlayerId: playerIds[column] }
}

test('比賽與選手都沒變時，編輯中的選取仍有效並取得最新結果', () => {
  const playerIds = ['a', 'b', 'c', 'd']
  const prelim = { groups: [{ label: 'A', playerIds }], results: {} }
  const selected = selectCell(playerIds, 1, 3, getPrelimMatches(prelim))

  // 有新結果時比賽陣列會重建，但選取的比賽仍是同兩位選手
  const other = getPrelimMatches(prelim).find((match) => match.id !== selected.match.id)
  prelim.results[other.id] = { winnerSlot: 0, scoreA: 3, scoreB: 1 }
  prelim.results[selected.match.id] = { winnerSlot: 0, scoreA: 1, scoreB: 0 }
  const matches = getPrelimMatches(prelim)

  assert.equal(isPrelimCrossTableSelectionCurrent(selected, matches), true)
  const fresh = getPrelimCrossTableSelectionCell(selected, matches)
  assert.equal(fresh.match.id, selected.match.id)
  assert.equal(fresh.rowSlot, selected.rowSlot)
  assert.deepEqual(fresh.match.result, { winnerSlot: 0, scoreA: 1, scoreB: 0 })
})

test('重新分組後同一比賽 id 換了選手，不會用舊的選取寫入', () => {
  const before = getPrelimMatches({ groups: [{ label: 'A', playerIds: ['a', 'b', 'c', 'd'] }], results: {} })
  const selected = selectCell(['a', 'b', 'c', 'd'], 0, 3, before)

  // 組名與比賽 id 不變，但抽籤後換成另一批選手
  const after = getPrelimMatches({ groups: [{ label: 'A', playerIds: ['e', 'f', 'g', 'h'] }], results: {} })
  assert.ok(after.some((match) => match.id === selected.match.id), '比賽 id 應沿用')

  assert.equal(isPrelimCrossTableSelectionCurrent(selected, after), false)
  assert.equal(getPrelimCrossTableSelectionCell(selected, after), null)
})

test('同一比賽 id 只換掉其中一位選手，也視為失效', () => {
  const before = getPrelimMatches({ groups: [{ label: 'A', playerIds: ['a', 'b', 'c', 'd'] }], results: {} })
  const selected = selectCell(['a', 'b', 'c', 'd'], 0, 3, before)
  const after = before.map((match) =>
    match.id === selected.match.id ? { ...match, playerA: 'a', playerB: 'x' } : match,
  )

  assert.equal(isPrelimCrossTableSelectionCurrent(selected, after), false)
})

test('重新分組後比賽 id 不存在，不會用舊的選取寫入', () => {
  const before = getPrelimMatches({ groups: [{ label: 'A', playerIds: ['a', 'b', 'c', 'd', 'e'] }], results: {} })
  const selected = selectCell(['a', 'b', 'c', 'd', 'e'], 0, 4, before)
  const after = before.filter((match) => match.id !== selected.match.id)

  assert.equal(isPrelimCrossTableSelectionCurrent(selected, after), false)
  assert.equal(isPrelimCrossTableSelectionCurrent(selected, []), false)
  assert.equal(isPrelimCrossTableSelectionCurrent(null, before), false)
})

test('同兩位選手但排程先後對調時，選取有效且依目前資料重算列、欄位置', () => {
  const playerIds = ['a', 'b', 'c', 'd']
  const before = getPrelimMatches({ groups: [{ label: 'A', playerIds }], results: {} })
  const selected = selectCell(playerIds, 0, 3, before)
  const after = before.map((match) =>
    match.id === selected.match.id ? { ...match, playerA: match.playerB, playerB: match.playerA } : match,
  )

  assert.equal(isPrelimCrossTableSelectionCurrent(selected, after), true)
  const fresh = getPrelimCrossTableSelectionCell(selected, after)
  assert.equal(fresh.rowSlot, 1 - selected.rowSlot)
  assert.deepEqual(getPrelimMatchResultFromCell(fresh, 3, 1), {
    winnerSlot: fresh.rowSlot,
    scoreA: fresh.rowSlot === 0 ? 3 : 1,
    scoreB: fresh.rowSlot === 0 ? 1 : 3,
  })
})

test('只點勝方沒填比分時依列選手角度回傳勝或敗，沒結果則為 null', () => {
  const playerIds = ['a', 'b', 'c', 'd']
  const prelim = { groups: [{ label: 'A', playerIds }], results: {} }
  const initial = getPrelimMatches(prelim)
  const reversed = initial.find((match) => match.playerA === 'd' && match.playerB === 'b')
  const forward = initial.find((match) => match.playerA === 'a' && match.playerB === 'd')
  const scored = initial.find((match) => match.playerA === 'a' && match.playerB === 'b')
  prelim.results[reversed.id] = { winnerSlot: 0, scoreA: null, scoreB: null } // d 勝
  prelim.results[forward.id] = { winnerSlot: 0 } // a 勝，沒有比分欄位
  prelim.results[scored.id] = { winnerSlot: 1, scoreA: 1, scoreB: 3 } // b 勝
  const matches = getPrelimMatches(prelim)

  const bVsD = getPrelimCrossTableCell(playerIds, 1, 3, matches)
  assert.equal(bVsD.scoreRow, null)
  assert.equal(bVsD.scoreColumn, null)
  assert.equal(bVsD.rowOutcome, 'loss')

  const aVsD = getPrelimCrossTableCell(playerIds, 0, 3, matches)
  assert.equal(aVsD.scoreRow, null)
  assert.equal(aVsD.rowOutcome, 'win')

  const aVsB = getPrelimCrossTableCell(playerIds, 0, 1, matches)
  assert.equal(aVsB.rowOutcome, 'loss')

  const aVsC = getPrelimCrossTableCell(playerIds, 0, 2, matches)
  assert.equal(aVsC.match.result, null)
  assert.equal(aVsC.rowOutcome, null)
})
