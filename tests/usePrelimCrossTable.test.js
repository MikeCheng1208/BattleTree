import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrelimCrossTableCell, getPrelimMatchResultFromCell } from '../src/composables/usePrelimCrossTable.js'
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
