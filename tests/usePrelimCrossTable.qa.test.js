import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrelimCrossTableCell, getPrelimMatchResultFromCell } from '../src/composables/usePrelimCrossTable.js'
import { getPrelimMatches } from '../src/composables/usePrelimEngine.js'

const LETTERS = 'abcdefghij'.split('')

function rosterOf(size) {
  return LETTERS.slice(0, size)
}

function prelimOf(playerIds, results = {}) {
  return { groups: [{ label: 'A', playerIds }], results }
}

// 列出所有可編輯格（對角線上半部 row < column）
function upperCells(size) {
  const cells = []
  for (let row = 0; row < size; row += 1) {
    for (let column = row + 1; column < size; column += 1) cells.push([row, column])
  }
  return cells
}

// 與 PrelimCrossTable.vue 樣板相同的顯示條件：兩邊比分都不是 null/undefined 才顯示「列:欄」，否則空白
function displayedScore(cell) {
  return cell.scoreRow != null && cell.scoreColumn != null ? `${cell.scoreRow}:${cell.scoreColumn}` : ''
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

// 期望排程：以 origin/main 的 getPrelimMatches（一輪循環、圓桌輪轉法）結果寫死，用來偵測排程被改動
const EXPECTED_SCHEDULE_4 = [
  { id: 'p0-m0', playerA: 'a', playerB: 'd', roundIndex: 0 },
  { id: 'p0-m1', playerA: 'b', playerB: 'c', roundIndex: 0 },
  { id: 'p0-m2', playerA: 'a', playerB: 'c', roundIndex: 1 },
  { id: 'p0-m3', playerA: 'd', playerB: 'b', roundIndex: 1 },
  { id: 'p0-m4', playerA: 'a', playerB: 'b', roundIndex: 2 },
  { id: 'p0-m5', playerA: 'c', playerB: 'd', roundIndex: 2 },
]

const EXPECTED_SCHEDULE_5 = [
  { id: 'p0-m0', playerA: 'b', playerB: 'e', roundIndex: 0 },
  { id: 'p0-m1', playerA: 'c', playerB: 'd', roundIndex: 0 },
  { id: 'p0-m2', playerA: 'a', playerB: 'e', roundIndex: 1 },
  { id: 'p0-m3', playerA: 'b', playerB: 'c', roundIndex: 1 },
  { id: 'p0-m4', playerA: 'a', playerB: 'd', roundIndex: 2 },
  { id: 'p0-m5', playerA: 'e', playerB: 'c', roundIndex: 2 },
  { id: 'p0-m6', playerA: 'a', playerB: 'c', roundIndex: 3 },
  { id: 'p0-m7', playerA: 'd', playerB: 'b', roundIndex: 3 },
  { id: 'p0-m8', playerA: 'a', playerB: 'b', roundIndex: 4 },
  { id: 'p0-m9', playerA: 'd', playerB: 'e', roundIndex: 4 },
]

const EXPECTED_SCHEDULE_6 = [
  { id: 'p0-m0', playerA: 'a', playerB: 'f', roundIndex: 0 },
  { id: 'p0-m1', playerA: 'b', playerB: 'e', roundIndex: 0 },
  { id: 'p0-m2', playerA: 'c', playerB: 'd', roundIndex: 0 },
  { id: 'p0-m3', playerA: 'a', playerB: 'e', roundIndex: 1 },
  { id: 'p0-m4', playerA: 'f', playerB: 'd', roundIndex: 1 },
  { id: 'p0-m5', playerA: 'b', playerB: 'c', roundIndex: 1 },
  { id: 'p0-m6', playerA: 'a', playerB: 'd', roundIndex: 2 },
  { id: 'p0-m7', playerA: 'e', playerB: 'c', roundIndex: 2 },
  { id: 'p0-m8', playerA: 'f', playerB: 'b', roundIndex: 2 },
  { id: 'p0-m9', playerA: 'a', playerB: 'c', roundIndex: 3 },
  { id: 'p0-m10', playerA: 'd', playerB: 'b', roundIndex: 3 },
  { id: 'p0-m11', playerA: 'e', playerB: 'f', roundIndex: 3 },
  { id: 'p0-m12', playerA: 'a', playerB: 'b', roundIndex: 4 },
  { id: 'p0-m13', playerA: 'c', playerB: 'f', roundIndex: 4 },
  { id: 'p0-m14', playerA: 'd', playerB: 'e', roundIndex: 4 },
]

function scheduleOf(matches) {
  return matches.map(({ id, playerA, playerB, roundIndex }) => ({ id, playerA, playerB, roundIndex }))
}

// ---------------------------------------------------------------------------
// 1. 格子對應比賽、對角線與下半部為 null
// ---------------------------------------------------------------------------

for (const size of [3, 4, 5, 6]) {
  test(`QA 交叉表 ${size} 人組：上半部每格對應唯一比賽且全部比賽剛好對應一次，對角線與下半部為 null`, () => {
    const playerIds = rosterOf(size)
    const matches = getPrelimMatches(prelimOf(playerIds))
    assert.equal(matches.length, (size * (size - 1)) / 2)

    const mappedIds = []
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
        if (row >= column) {
          assert.equal(cell, null, `(${row},${column}) 為對角線或下半部，應為 null`)
          continue
        }
        assert.ok(cell, `(${row},${column}) 應對應一場比賽`)
        const rowId = playerIds[row]
        const columnId = playerIds[column]
        assert.deepEqual(
          [cell.match.playerA, cell.match.playerB].sort(),
          [rowId, columnId].sort(),
          `(${row},${column}) 應是 ${rowId} 對 ${columnId}`,
        )
        // rowSlot 指向列選手在排程中的位置
        assert.equal(cell.rowSlot === 0 ? cell.match.playerA : cell.match.playerB, rowId)
        assert.equal(cell.columnSlot === 0 ? cell.match.playerA : cell.match.playerB, columnId)
        assert.equal(cell.rowSlot + cell.columnSlot, 1)
        // 回傳的是原本陣列中的物件
        assert.ok(matches.includes(cell.match))
        assert.equal(cell.scoreRow, null)
        assert.equal(cell.scoreColumn, null)
        mappedIds.push(cell.match.id)
      }
    }

    assert.equal(new Set(mappedIds).size, mappedIds.length, '不應有兩格對應同一場比賽')
    assert.deepEqual([...mappedIds].sort(), matches.map((match) => match.id).sort())
  })
}

test('QA 交叉表：超出名單範圍的索引（row < column）找不到比賽時回傳 null', () => {
  const playerIds = rosterOf(4)
  const matches = getPrelimMatches(prelimOf(playerIds))
  assert.equal(getPrelimCrossTableCell(playerIds, 0, 4, matches), null)
  assert.equal(getPrelimCrossTableCell(playerIds, 3, 9, matches), null)
})

// ---------------------------------------------------------------------------
// 2. 反向／正向配對
// ---------------------------------------------------------------------------

for (const size of [4, 5, 6]) {
  test(`QA 交叉表 ${size} 人組：反向配對（playerA 是欄選手）比分翻轉、正向配對不翻轉`, () => {
    const playerIds = rosterOf(size)
    const prelim = prelimOf(playerIds)
    const initial = getPrelimMatches(prelim)
    // 每場給不同、可辨識的比分：scoreA = 20 + i，scoreB = i
    initial.forEach((match, index) => {
      prelim.results[match.id] = { winnerSlot: 0, scoreA: 20 + index, scoreB: index }
    })
    const matches = getPrelimMatches(prelim)

    let reversedCount = 0
    let forwardCount = 0
    for (const [row, column] of upperCells(size)) {
      const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
      const index = matches.indexOf(cell.match)
      const { scoreA, scoreB } = prelim.results[cell.match.id]
      assert.equal(scoreA, 20 + index)
      assert.equal(scoreB, index)

      if (cell.match.playerA === playerIds[column]) {
        reversedCount += 1
        assert.equal(cell.match.playerB, playerIds[row])
        assert.equal(cell.rowSlot, 1, `(${row},${column}) 反向配對 rowSlot 應為 1`)
        assert.equal(cell.columnSlot, 0)
        assert.equal(cell.scoreRow, scoreB, `(${row},${column}) 列選手比分應取 scoreB`)
        assert.equal(cell.scoreColumn, scoreA, `(${row},${column}) 欄選手比分應取 scoreA`)
      } else {
        forwardCount += 1
        assert.equal(cell.match.playerA, playerIds[row])
        assert.equal(cell.match.playerB, playerIds[column])
        assert.equal(cell.rowSlot, 0, `(${row},${column}) 正向配對 rowSlot 應為 0`)
        assert.equal(cell.columnSlot, 1)
        assert.equal(cell.scoreRow, scoreA)
        assert.equal(cell.scoreColumn, scoreB)
      }
      assert.equal(displayedScore(cell), `${cell.scoreRow}:${cell.scoreColumn}`)
    }

    assert.ok(reversedCount > 0, `${size} 人組排程應至少有一場反向配對，否則此測試沒有意義`)
    assert.ok(forwardCount > 0)
  })
}

test('QA 交叉表 4 人組：具體反向配對 d 對 b（排程 playerA=d）在 (b,d) 格顯示「b 比分:d 比分」', () => {
  const playerIds = rosterOf(4)
  const prelim = prelimOf(playerIds)
  const reversed = getPrelimMatches(prelim).find((match) => match.playerA === 'd' && match.playerB === 'b')
  assert.ok(reversed)
  // 排程順序 d（slot 0）4 分、b（slot 1）9 分，b 勝
  prelim.results[reversed.id] = { winnerSlot: 1, scoreA: 4, scoreB: 9 }
  const cell = getPrelimCrossTableCell(playerIds, 1, 3, getPrelimMatches(prelim))
  assert.equal(cell.match.id, reversed.id)
  assert.equal(cell.match.winnerId, 'b')
  assert.equal(cell.rowSlot, 1)
  assert.equal(cell.columnSlot, 0)
  assert.equal(cell.scoreRow, 9)
  assert.equal(cell.scoreColumn, 4)
  assert.equal(displayedScore(cell), '9:4')
})

// ---------------------------------------------------------------------------
// 3. 未打空白、0 分保留
// ---------------------------------------------------------------------------

test('QA 交叉表：未打的各種情況 scoreRow/scoreColumn 照實作回傳，UI 只在兩者皆非 null 時顯示', () => {
  const playerIds = rosterOf(4)
  // 4 人組：a 對 d 是正向（p0-m0），d 對 b 是反向（p0-m3）
  const forwardId = 'p0-m0'
  const reversedId = 'p0-m3'
  const readCells = (results) => {
    const matches = getPrelimMatches(prelimOf(playerIds, results))
    return {
      forward: getPrelimCrossTableCell(playerIds, 0, 3, matches),
      reversed: getPrelimCrossTableCell(playerIds, 1, 3, matches),
    }
  }

  // 無 result
  let { forward, reversed } = readCells({})
  assert.equal(forward.match.id, forwardId)
  assert.equal(reversed.match.id, reversedId)
  assert.equal(forward.match.result, null)
  assert.equal(forward.scoreRow, null)
  assert.equal(forward.scoreColumn, null)
  assert.equal(reversed.scoreRow, null)
  assert.equal(reversed.scoreColumn, null)
  assert.equal(displayedScore(forward), '')

  // 只有 winnerSlot、比分為 null（對戰卡只點勝方的情況）
  ;({ forward, reversed } = readCells({
    [forwardId]: { winnerSlot: 0, scoreA: null, scoreB: null },
    [reversedId]: { winnerSlot: 1, scoreA: null, scoreB: null },
  }))
  assert.equal(forward.match.winnerId, 'a')
  assert.equal(forward.scoreRow, null)
  assert.equal(forward.scoreColumn, null)
  assert.equal(reversed.match.winnerId, 'b')
  assert.equal(reversed.scoreRow, null)
  assert.equal(reversed.scoreColumn, null)
  assert.equal(displayedScore(forward), '')
  assert.equal(displayedScore(reversed), '')

  // 只有 winnerSlot、完全沒有比分欄位（undefined）也視為 null
  ;({ forward } = readCells({ [forwardId]: { winnerSlot: 1 } }))
  assert.equal(forward.scoreRow, null)
  assert.equal(forward.scoreColumn, null)
  assert.equal(displayedScore(forward), '')

  // 只有一邊有比分：實作照實回傳那一邊的數字、另一邊 null；UI 因不完整而顯示空白
  ;({ forward, reversed } = readCells({
    [forwardId]: { winnerSlot: 0, scoreA: 5, scoreB: null },
    [reversedId]: { winnerSlot: 0, scoreA: 5, scoreB: null },
  }))
  assert.equal(forward.scoreRow, 5)
  assert.equal(forward.scoreColumn, null)
  assert.equal(reversed.scoreRow, null, '反向配對：列選手是 playerB，scoreB 為 null')
  assert.equal(reversed.scoreColumn, 5)
  assert.equal(displayedScore(forward), '')
  assert.equal(displayedScore(reversed), '')

  ;({ forward } = readCells({ [forwardId]: { winnerSlot: 1, scoreA: null, scoreB: 7 } }))
  assert.equal(forward.scoreRow, null)
  assert.equal(forward.scoreColumn, 7)
  assert.equal(displayedScore(forward), '')
})

test('QA 交叉表：比分為 0 時保留 0（不是 null），且會顯示', () => {
  const playerIds = rosterOf(4)
  const matches = getPrelimMatches(
    prelimOf(playerIds, {
      'p0-m0': { winnerSlot: 1, scoreA: 0, scoreB: 3 }, // a 對 d，正向
      'p0-m3': { winnerSlot: 1, scoreA: 0, scoreB: 2 }, // d 對 b，反向
      'p0-m4': { winnerSlot: 0, scoreA: 0, scoreB: 0 }, // a 對 b，0:0 指定勝者
    }),
  )

  const forward = getPrelimCrossTableCell(playerIds, 0, 3, matches)
  assert.equal(forward.scoreRow, 0)
  assert.equal(forward.scoreColumn, 3)
  assert.equal(displayedScore(forward), '0:3')

  const reversed = getPrelimCrossTableCell(playerIds, 1, 3, matches)
  assert.equal(reversed.scoreRow, 2)
  assert.equal(reversed.scoreColumn, 0)
  assert.equal(displayedScore(reversed), '2:0')

  const zeroZero = getPrelimCrossTableCell(playerIds, 0, 1, matches)
  assert.equal(zeroZero.match.id, 'p0-m4')
  assert.equal(zeroZero.scoreRow, 0)
  assert.equal(zeroZero.scoreColumn, 0)
  assert.equal(displayedScore(zeroZero), '0:0')
})

// ---------------------------------------------------------------------------
// 4. 找不到比賽
// ---------------------------------------------------------------------------

test('QA 交叉表：matches 為空陣列時所有格子都是 null', () => {
  const playerIds = rosterOf(5)
  for (let row = 0; row < playerIds.length; row += 1) {
    for (let column = 0; column < playerIds.length; column += 1) {
      assert.equal(getPrelimCrossTableCell(playerIds, row, column, []), null, `(${row},${column})`)
    }
  }
})

test('QA 交叉表：matches 缺少某場時只有該格為 null，其他格不受影響', () => {
  const playerIds = rosterOf(4)
  const all = getPrelimMatches(prelimOf(playerIds))
  const missing = all.find((match) => match.playerA === 'd' && match.playerB === 'b')
  const matches = all.filter((match) => match !== missing)

  for (const [row, column] of upperCells(4)) {
    const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
    if (row === 1 && column === 3) {
      assert.equal(cell, null, 'b 對 d 這場不在 matches 裡，應回傳 null')
    } else {
      assert.ok(cell, `(${row},${column}) 應仍找得到比賽`)
    }
  }
})

test('QA 交叉表：名單中的選手不在任何比賽中時回傳 null', () => {
  const matches = getPrelimMatches(prelimOf(rosterOf(4)))
  const playerIds = ['a', 'b', 'zz', 'd']
  assert.equal(getPrelimCrossTableCell(playerIds, 0, 2, matches), null)
  assert.equal(getPrelimCrossTableCell(playerIds, 2, 3, matches), null)
  assert.ok(getPrelimCrossTableCell(playerIds, 0, 1, matches))
})

// ---------------------------------------------------------------------------
// 5. 同名選手以 id 配對
// ---------------------------------------------------------------------------

test('QA 交叉表：兩位選手 displayName 相同但 id 不同時仍以 id 配對', () => {
  const players = [
    { id: 'x1', name: '王小明', displayName: '王小明' },
    { id: 'x2', name: '王小明', displayName: '王小明' },
    { id: 'x3', name: '李大華', displayName: '李大華' },
    // 另一組也有同名選手
    { id: 'y1', name: '王小明', displayName: '王小明' },
    { id: 'y2', name: '王小明', displayName: '王小明' },
    { id: 'y3', name: '李大華', displayName: '李大華' },
  ]
  assert.equal(new Set(players.map((player) => player.displayName)).size, 2)

  const groupA = ['x1', 'x2', 'x3']
  const groupB = ['y1', 'y2', 'y3']
  const prelim = {
    groups: [
      { label: 'A', playerIds: groupA },
      { label: 'B', playerIds: groupB },
    ],
    results: {},
  }
  const initial = getPrelimMatches(prelim)
  const aMatch = initial.find((match) => match.groupIndex === 0 && new Set([match.playerA, match.playerB]).has('x1') && new Set([match.playerA, match.playerB]).has('x2'))
  const bMatch = initial.find((match) => match.groupIndex === 1 && new Set([match.playerA, match.playerB]).has('y1') && new Set([match.playerA, match.playerB]).has('y2'))
  assert.ok(aMatch)
  assert.ok(bMatch)
  prelim.results[aMatch.id] = { winnerSlot: aMatch.playerA === 'x1' ? 0 : 1, scoreA: aMatch.playerA === 'x1' ? 5 : 1, scoreB: aMatch.playerA === 'x1' ? 1 : 5 }
  prelim.results[bMatch.id] = { winnerSlot: bMatch.playerA === 'y2' ? 0 : 1, scoreA: bMatch.playerA === 'y2' ? 8 : 2, scoreB: bMatch.playerA === 'y2' ? 2 : 8 }

  // 刻意傳入兩組全部的比賽，確認不會因同名而抓到另一組
  const matches = getPrelimMatches(prelim)
  const cellA = getPrelimCrossTableCell(groupA, 0, 1, matches)
  assert.equal(cellA.match.id, aMatch.id)
  assert.equal(cellA.match.groupIndex, 0)
  assert.equal(cellA.match.winnerId, 'x1')
  assert.equal(cellA.scoreRow, 5)
  assert.equal(cellA.scoreColumn, 1)

  const cellB = getPrelimCrossTableCell(groupB, 0, 1, matches)
  assert.equal(cellB.match.id, bMatch.id)
  assert.equal(cellB.match.groupIndex, 1)
  assert.equal(cellB.match.winnerId, 'y2')
  assert.equal(cellB.scoreRow, 2)
  assert.equal(cellB.scoreColumn, 8)

  // 同組內同名的 x1 / x2 互換位置時，列/欄仍依 id 對應
  const swapped = ['x2', 'x1', 'x3']
  const cellSwapped = getPrelimCrossTableCell(swapped, 0, 1, matches)
  assert.equal(cellSwapped.match.id, aMatch.id)
  assert.equal(cellSwapped.scoreRow, 1)
  assert.equal(cellSwapped.scoreColumn, 5)

  // 名單用名字（而非 id）時找不到任何比賽
  assert.equal(getPrelimCrossTableCell(['王小明', '王小明', '李大華'], 0, 2, matches), null)
})

// ---------------------------------------------------------------------------
// 6. getPrelimMatchResultFromCell
// ---------------------------------------------------------------------------

test('QA getPrelimMatchResultFromCell：正向配對 scoreA/scoreB 不翻轉、勝方依比分', () => {
  const playerIds = rosterOf(4)
  const forward = getPrelimCrossTableCell(playerIds, 0, 3, getPrelimMatches(prelimOf(playerIds)))
  assert.equal(forward.rowSlot, 0)
  assert.deepEqual(getPrelimMatchResultFromCell(forward, 5, 2), { winnerSlot: 0, scoreA: 5, scoreB: 2 })
  assert.deepEqual(getPrelimMatchResultFromCell(forward, 1, 4), { winnerSlot: 1, scoreA: 1, scoreB: 4 })
  assert.deepEqual(getPrelimMatchResultFromCell(forward, 0, 11), { winnerSlot: 1, scoreA: 0, scoreB: 11 })
})

test('QA getPrelimMatchResultFromCell：反向配對 scoreA/scoreB 翻轉回排程順序、勝方 slot 正確', () => {
  const playerIds = rosterOf(4)
  const reversed = getPrelimCrossTableCell(playerIds, 1, 3, getPrelimMatches(prelimOf(playerIds)))
  assert.equal(reversed.match.playerA, 'd')
  assert.equal(reversed.rowSlot, 1)
  // 列選手 b 5 分勝 d 2 分 → b 是 slot 1
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 5, 2), { winnerSlot: 1, scoreA: 2, scoreB: 5 })
  // 欄選手 d 勝 → slot 0
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 1, 4), { winnerSlot: 0, scoreA: 4, scoreB: 1 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 11, 0), { winnerSlot: 1, scoreA: 0, scoreB: 11 })
})

test('QA getPrelimMatchResultFromCell：平手且指定 tieWinnerSlot 時以指定為勝方', () => {
  const playerIds = rosterOf(4)
  const matches = getPrelimMatches(prelimOf(playerIds))
  const forward = getPrelimCrossTableCell(playerIds, 0, 3, matches)
  const reversed = getPrelimCrossTableCell(playerIds, 1, 3, matches)

  assert.deepEqual(getPrelimMatchResultFromCell(forward, 3, 3, forward.rowSlot), { winnerSlot: 0, scoreA: 3, scoreB: 3 })
  assert.deepEqual(getPrelimMatchResultFromCell(forward, 3, 3, forward.columnSlot), { winnerSlot: 1, scoreA: 3, scoreB: 3 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 2, 2, reversed.rowSlot), { winnerSlot: 1, scoreA: 2, scoreB: 2 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 2, 2, reversed.columnSlot), { winnerSlot: 0, scoreA: 2, scoreB: 2 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 0, 0, reversed.columnSlot), { winnerSlot: 0, scoreA: 0, scoreB: 0 })
})

test('QA getPrelimMatchResultFromCell：平手未指定勝方時 winnerSlot 為 null（實作行為）', () => {
  const playerIds = rosterOf(4)
  const matches = getPrelimMatches(prelimOf(playerIds))
  const forward = getPrelimCrossTableCell(playerIds, 0, 3, matches)
  const reversed = getPrelimCrossTableCell(playerIds, 1, 3, matches)
  // 註：PrelimCrossTable.vue 的 saveScore 在平手且未選勝者時直接 return，不會送出這個結果
  assert.deepEqual(getPrelimMatchResultFromCell(forward, 3, 3), { winnerSlot: null, scoreA: 3, scoreB: 3 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 0, 0), { winnerSlot: null, scoreA: 0, scoreB: 0 })
})

test('QA getPrelimMatchResultFromCell：非平手時忽略 tieWinnerSlot（UI 一律會傳入此參數）', () => {
  const playerIds = rosterOf(4)
  const matches = getPrelimMatches(prelimOf(playerIds))
  const forward = getPrelimCrossTableCell(playerIds, 0, 3, matches)
  const reversed = getPrelimCrossTableCell(playerIds, 1, 3, matches)
  // saveScore 在 tieWinner 為空字串時傳入 columnSlot
  assert.deepEqual(getPrelimMatchResultFromCell(forward, 5, 2, forward.columnSlot), { winnerSlot: 0, scoreA: 5, scoreB: 2 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 5, 2, reversed.columnSlot), { winnerSlot: 1, scoreA: 2, scoreB: 5 })
  assert.deepEqual(getPrelimMatchResultFromCell(reversed, 1, 4, reversed.rowSlot), { winnerSlot: 0, scoreA: 4, scoreB: 1 })
})

// 每組比分：[列, 欄, 平手時的勝者 'row' | 'column']
const ROUND_TRIP_SCORES = [
  [3, 1],
  [1, 3],
  [0, 2],
  [2, 0],
  [11, 9],
  [9, 11],
  [0, 5],
  [21, 0],
  [2, 2, 'row'],
  [2, 2, 'column'],
  [0, 0, 'row'],
  [0, 0, 'column'],
]

function expectedWinnerId(playerIds, row, column, [scoreRow, scoreColumn, tieWinner]) {
  if (scoreRow === scoreColumn) return tieWinner === 'row' ? playerIds[row] : playerIds[column]
  return scoreRow > scoreColumn ? playerIds[row] : playerIds[column]
}

for (const size of [3, 4, 5, 6]) {
  test(`QA round-trip ${size} 人組：每一格 × 每組比分單獨寫回後讀出的比分與勝者一致`, () => {
    const playerIds = rosterOf(size)
    const groups = [{ label: 'A', playerIds }]
    const initial = getPrelimMatches({ groups, results: {} })

    for (const [row, column] of upperCells(size)) {
      const cell = getPrelimCrossTableCell(playerIds, row, column, initial)
      for (const entry of ROUND_TRIP_SCORES) {
        const [scoreRow, scoreColumn, tieWinner] = entry
        const tieSlot = tieWinner === 'row' ? cell.rowSlot : tieWinner === 'column' ? cell.columnSlot : null
        const result = getPrelimMatchResultFromCell(cell, scoreRow, scoreColumn, tieSlot)
        const prelim = { groups, results: { [cell.match.id]: result } }
        const reread = getPrelimCrossTableCell(playerIds, row, column, getPrelimMatches(prelim))
        const label = `(${row},${column}) ${scoreRow}:${scoreColumn}${tieWinner ? ` 平手勝者 ${tieWinner}` : ''}`

        assert.equal(reread.match.id, cell.match.id, label)
        assert.equal(reread.scoreRow, scoreRow, label)
        assert.equal(reread.scoreColumn, scoreColumn, label)
        assert.equal(reread.match.winnerId, expectedWinnerId(playerIds, row, column, entry), label)
        assert.equal(displayedScore(reread), `${scoreRow}:${scoreColumn}`, label)
      }
    }
  })

  test(`QA round-trip ${size} 人組：所有格子同時寫回不同比分後逐格讀出皆一致（不互相干擾）`, () => {
    const playerIds = rosterOf(size)
    const groups = [{ label: 'A', playerIds }]
    const initial = getPrelimMatches({ groups, results: {} })
    const cells = upperCells(size)

    for (let offset = 0; offset < ROUND_TRIP_SCORES.length; offset += 1) {
      const results = {}
      const expected = new Map()
      cells.forEach(([row, column], index) => {
        const entry = ROUND_TRIP_SCORES[(index + offset) % ROUND_TRIP_SCORES.length]
        const [scoreRow, scoreColumn, tieWinner] = entry
        const cell = getPrelimCrossTableCell(playerIds, row, column, initial)
        const tieSlot = tieWinner === 'row' ? cell.rowSlot : tieWinner === 'column' ? cell.columnSlot : null
        results[cell.match.id] = getPrelimMatchResultFromCell(cell, scoreRow, scoreColumn, tieSlot)
        expected.set(`${row},${column}`, entry)
      })

      const matches = getPrelimMatches({ groups, results })
      assert.ok(matches.every((match) => match.winnerId), `offset ${offset}：全部比賽都應有勝者`)
      for (const [row, column] of cells) {
        const entry = expected.get(`${row},${column}`)
        const reread = getPrelimCrossTableCell(playerIds, row, column, matches)
        const label = `offset ${offset} (${row},${column}) ${entry[0]}:${entry[1]}`
        assert.equal(reread.scoreRow, entry[0], label)
        assert.equal(reread.scoreColumn, entry[1], label)
        assert.equal(reread.match.winnerId, expectedWinnerId(playerIds, row, column, entry), label)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// 7. 排程回歸、不修改輸入
// ---------------------------------------------------------------------------

test('QA 排程回歸：4 人組 getPrelimMatches 的 id/playerA/playerB/roundIndex 與寫死的期望一致', () => {
  assert.deepEqual(scheduleOf(getPrelimMatches(prelimOf(rosterOf(4)))), EXPECTED_SCHEDULE_4)
})

test('QA 排程回歸：5 人組 getPrelimMatches 的 id/playerA/playerB/roundIndex 與寫死的期望一致', () => {
  assert.deepEqual(scheduleOf(getPrelimMatches(prelimOf(rosterOf(5)))), EXPECTED_SCHEDULE_5)
})

test('QA 排程回歸：6 人組 getPrelimMatches 的 id/playerA/playerB/roundIndex 與寫死的期望一致', () => {
  assert.deepEqual(scheduleOf(getPrelimMatches(prelimOf(rosterOf(6)))), EXPECTED_SCHEDULE_6)
})

test('QA 排程回歸：兩組（4 人＋5 人）時 id 前綴依組別、matchIndex 各組從 0 起算', () => {
  const groupB = ['e', 'f', 'g', 'h', 'i']
  const matches = getPrelimMatches({
    groups: [
      { label: 'A', playerIds: rosterOf(4) },
      { label: 'B', playerIds: groupB },
    ],
    results: {},
  })
  const toGroupB = (id) => groupB[LETTERS.indexOf(id)]
  const expected = [
    ...EXPECTED_SCHEDULE_4.map((entry, matchIndex) => ({ ...entry, groupIndex: 0, groupLabel: 'A', matchIndex })),
    ...EXPECTED_SCHEDULE_5.map((entry, matchIndex) => ({
      id: entry.id.replace(/^p0-/, 'p1-'),
      playerA: toGroupB(entry.playerA),
      playerB: toGroupB(entry.playerB),
      roundIndex: entry.roundIndex,
      groupIndex: 1,
      groupLabel: 'B',
      matchIndex,
    })),
  ]
  assert.deepEqual(
    matches.map(({ id, playerA, playerB, roundIndex, groupIndex, groupLabel, matchIndex }) => ({
      id,
      playerA,
      playerB,
      roundIndex,
      groupIndex,
      groupLabel,
      matchIndex,
    })),
    expected,
  )
})

test('QA 交叉表：getPrelimCrossTableCell / getPrelimMatchResultFromCell 不修改 matches 陣列與比賽物件', () => {
  for (const size of [3, 4, 5, 6]) {
    const playerIds = rosterOf(size)
    const prelim = prelimOf(playerIds)
    getPrelimMatches(prelim).forEach((match, index) => {
      // 混合：有比分、只有勝方、無結果
      if (index % 3 === 0) prelim.results[match.id] = { winnerSlot: 1, scoreA: index, scoreB: index + 2 }
      else if (index % 3 === 1) prelim.results[match.id] = { winnerSlot: 0, scoreA: null, scoreB: null }
    })
    const prelimSnapshot = structuredClone(prelim)
    const playerIdsSnapshot = [...playerIds]
    const matches = getPrelimMatches(prelim)
    const snapshot = structuredClone(matches)
    const refs = [...matches]

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
        if (cell) {
          getPrelimMatchResultFromCell(cell, 3, 1)
          getPrelimMatchResultFromCell(cell, 2, 2, cell.columnSlot)
        }
      }
    }

    assert.deepEqual(matches, snapshot, `${size} 人組 matches 內容不應被修改`)
    assert.equal(matches.length, refs.length)
    matches.forEach((match, index) => assert.equal(match, refs[index], `${size} 人組 matches 順序與物件參照不應改變`))
    assert.deepEqual(prelim, prelimSnapshot, `${size} 人組 prelim 不應被修改`)
    assert.deepEqual(playerIds, playerIdsSnapshot)
    // 重新產生的排程與原本相同
    assert.deepEqual(getPrelimMatches(prelim), snapshot)
  }
})

test('QA 交叉表：對深度凍結的 matches 呼叫也不會拋錯（未嘗試寫入）', () => {
  const playerIds = rosterOf(5)
  const prelim = prelimOf(playerIds)
  getPrelimMatches(prelim).forEach((match, index) => {
    prelim.results[match.id] = { winnerSlot: index % 2, scoreA: index % 2 ? 1 : 4, scoreB: index % 2 ? 4 : 1 }
  })
  const matches = deepFreeze(getPrelimMatches(prelim))
  const frozenIds = deepFreeze([...playerIds])

  assert.doesNotThrow(() => {
    for (const [row, column] of upperCells(5)) {
      const cell = getPrelimCrossTableCell(frozenIds, row, column, matches)
      getPrelimMatchResultFromCell(cell, 0, 7)
    }
  })
})
