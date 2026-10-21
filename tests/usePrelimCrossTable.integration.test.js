import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { afterEach, beforeEach } from 'node:test'

// useBrackets.js 使用不帶副檔名的相對 import（Vite 可解析，Node ESM 不行）。
// 這裡註冊一個 resolve hook：解析失敗且為相對路徑、無副檔名時，自動補上 '.js' 再試一次。
const resolveHook = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
    const hasExtension = /\\.[cm]?js$/.test(specifier)
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && isRelative && !hasExtension) {
      return nextResolve(specifier + '.js', context)
    }
    throw error
  }
}
`
register(`data:text/javascript,${encodeURIComponent(resolveHook)}`)

// 簡易 localStorage（Map 實作），必須在載入 useBrackets.js 前就位。
function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(String(key)),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

const storage = createMemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })

const { effectScope, toRaw } = await import('vue')
const { useBrackets } = await import('../src/composables/useBrackets.js')
const {
  createPrelimGroups,
  getPrelimMatches,
  getPrelimQualification,
  getPrelimStandings,
  isPrelimComplete,
  normalizePrelimGroupSize,
} = await import('../src/composables/usePrelimEngine.js')
const { getPrelimCrossTableCell, getPrelimMatchResultFromCell } = await import(
  '../src/composables/usePrelimCrossTable.js'
)

const scopes = []

function mountBrackets() {
  const scope = effectScope()
  const api = scope.run(() => useBrackets())
  scopes.push(scope)
  return api
}

beforeEach(() => {
  storage.clear()
})

afterEach(() => {
  while (scopes.length) scopes.pop().stop()
})

// 9 人、每組 4 人 → round(9 / 4) = 2 組，人數 [5, 4]，兩組都含反向配對
const PLAYER_COUNT = 9
const GROUP_SIZE = 4

function setupPrelim() {
  const api = mountBrackets()
  api.setPlayerCount(PLAYER_COUNT)
  api.setFormat('prelim')
  api.setPrelimGroupSize(GROUP_SIZE)
  assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
  const bracket = api.currentBracket.value
  assert.equal(bracket.status, 'prelim')
  assert.deepEqual(bracket.prelim.groups.map((group) => group.playerIds.length), [5, 4])
  return api
}

// 與 PrelimView.vue 相同：每組只傳該組的比賽給交叉表
function groupMatches(api, groupIndex) {
  return getPrelimMatches(api.currentBracket.value.prelim).filter((match) => match.groupIndex === groupIndex)
}

function getCell(api, groupIndex, row, column) {
  const { playerIds } = api.currentBracket.value.prelim.groups[groupIndex]
  return getPrelimCrossTableCell(playerIds, row, column, groupMatches(api, groupIndex))
}

function getMatch(api, matchId) {
  return getPrelimMatches(api.currentBracket.value.prelim).find((match) => match.id === matchId)
}

function upperCells(size) {
  const cells = []
  for (let row = 0; row < size; row += 1) {
    for (let column = row + 1; column < size; column += 1) cells.push([row, column])
  }
  return cells
}

// 找出某組第一個正向（rowSlot 0）或反向（rowSlot 1）的格子
function findCell(api, groupIndex, rowSlot) {
  const { playerIds } = api.currentBracket.value.prelim.groups[groupIndex]
  for (const [row, column] of upperCells(playerIds.length)) {
    const cell = getCell(api, groupIndex, row, column)
    if (cell.rowSlot === rowSlot) return { row, column, rowId: playerIds[row], columnId: playerIds[column] }
  }
  throw new Error(`第 ${groupIndex} 組找不到 rowSlot=${rowSlot} 的格子`)
}

// 找出同組中一個正向、一個反向且沒有共同選手的格子，讓兩場結果不會疊加到同一位選手的名次
function findDisjointCells(api, groupIndex) {
  const { playerIds } = api.currentBracket.value.prelim.groups[groupIndex]
  const cells = upperCells(playerIds.length).map(([row, column]) => ({
    row,
    column,
    rowId: playerIds[row],
    columnId: playerIds[column],
    rowSlot: getCell(api, groupIndex, row, column).rowSlot,
  }))
  for (const forward of cells.filter((cell) => cell.rowSlot === 0)) {
    for (const reversed of cells.filter((cell) => cell.rowSlot === 1)) {
      const shared = [reversed.row, reversed.column].some((index) => index === forward.row || index === forward.column)
      if (!shared) return { forward, reversed }
    }
  }
  throw new Error(`第 ${groupIndex} 組找不到沒有共同選手的正向／反向格子`)
}

// reactive proxy 不能 structuredClone（DataCloneError），且巢狀屬性也可能是 proxy，
// 所以逐層 toRaw 後複製；不用 JSON 是為了保留值為 undefined 的 key，維持 deepEqual 的嚴格比較
function cloneRaw(value) {
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(cloneRaw)
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, cloneRaw(entry)]))
  }
  return raw
}

function standingOf(api, playerId) {
  const bracket = api.currentBracket.value
  for (const group of getPrelimStandings(bracket.prelim, bracket.players)) {
    const row = group.rows.find((entry) => entry.playerId === playerId)
    if (row) return row
  }
  throw new Error(`找不到 ${playerId} 的名次`)
}

function assertStanding(api, playerId, expected, label) {
  const { played, wins, losses, pointsFor, pointsAgainst, diff } = standingOf(api, playerId)
  assert.deepEqual({ played, wins, losses, pointsFor, pointsAgainst, diff }, expected, label)
}

// 模擬 PrelimCrossTable.vue 的 saveScore（只呼叫 composable，不經過元件）：
// 勝方不變 → update-score(matchId, scoreA, scoreB)；勝方改變或原本無結果 → set-result(matchId, winnerSlot, { scoreA, scoreB })
// 回傳實際走的路徑，平手未選勝者時回傳 'skipped'（元件直接 return）
function saveFromCrossTable(api, cell, rowScore, columnScore, tieWinner = '') {
  const first = Number(rowScore)
  const second = Number(columnScore)
  if (first === second && !tieWinner) return 'skipped'
  const { winnerSlot, scoreA, scoreB } = getPrelimMatchResultFromCell(
    cell,
    first,
    second,
    tieWinner === 'row' ? cell.rowSlot : cell.columnSlot,
  )
  if (cell.match.result?.winnerSlot === winnerSlot) {
    api.updatePrelimScore(cell.match.id, scoreA, scoreB)
    return 'update-score'
  }
  api.setPrelimResult(cell.match.id, winnerSlot, { scoreA, scoreB })
  return 'set-result'
}

const EMPTY_ROW = { played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 }

// 期望排程（與 origin/main 的 getPrelimMatches 相同），以名單索引表示
const EXPECTED_SCHEDULE_4 = [
  [0, 3, 0],
  [1, 2, 0],
  [0, 2, 1],
  [3, 1, 1],
  [0, 1, 2],
  [2, 3, 2],
]
const EXPECTED_SCHEDULE_5 = [
  [1, 4, 0],
  [2, 3, 0],
  [0, 4, 1],
  [1, 2, 1],
  [0, 3, 2],
  [4, 2, 2],
  [0, 2, 3],
  [3, 1, 3],
  [0, 1, 4],
  [3, 4, 4],
]

function expectedScheduleFor(groups) {
  const tables = { 4: EXPECTED_SCHEDULE_4, 5: EXPECTED_SCHEDULE_5 }
  return groups.flatMap((group, groupIndex) =>
    tables[group.playerIds.length].map(([a, b, roundIndex], matchIndex) => ({
      id: `p${groupIndex}-m${matchIndex}`,
      groupIndex,
      matchIndex,
      roundIndex,
      playerA: group.playerIds[a],
      playerB: group.playerIds[b],
    })),
  )
}

function scheduleOf(matches) {
  return matches.map(({ id, groupIndex, matchIndex, roundIndex, playerA, playerB }) => ({
    id,
    groupIndex,
    matchIndex,
    roundIndex,
    playerA,
    playerB,
  }))
}

// ---------------------------------------------------------------------------

test('QA 整合 a：交叉表第一次輸入（無結果）走 setPrelimResult，對戰卡資料與名次表即時更新', () => {
  const api = setupPrelim()
  const { row, column, rowId, columnId } = findCell(api, 0, 0)
  const cell = getCell(api, 0, row, column)
  assert.equal(cell.match.result, null)

  assert.equal(saveFromCrossTable(api, cell, 11, 7), 'set-result')

  const match = getMatch(api, cell.match.id)
  assert.equal(match.playerA, rowId)
  assert.equal(match.playerB, columnId)
  assert.equal(match.winnerId, rowId)
  assert.deepEqual(match.result, { winnerSlot: 0, scoreA: 11, scoreB: 7 })

  assertStanding(api, rowId, { played: 1, wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 7, diff: 4 })
  assertStanding(api, columnId, { played: 1, wins: 0, losses: 1, pointsFor: 7, pointsAgainst: 11, diff: -4 })
  const bracket = api.currentBracket.value
  for (const playerId of bracket.prelim.groups.flatMap((group) => group.playerIds)) {
    if (playerId !== rowId && playerId !== columnId) assertStanding(api, playerId, EMPTY_ROW, playerId)
  }

  const reread = getCell(api, 0, row, column)
  assert.equal(reread.scoreRow, 11)
  assert.equal(reread.scoreColumn, 7)
  assert.equal(getPrelimQualification(bracket.prelim, bracket.players).complete, false)
})

test('QA 整合 a：比分含 0 時第一次輸入也正確寫入（0 不被當成缺值）', () => {
  const api = setupPrelim()
  const { row, column, rowId, columnId } = findCell(api, 1, 0)
  assert.equal(saveFromCrossTable(api, getCell(api, 1, row, column), 0, 5), 'set-result')

  const match = getMatch(api, getCell(api, 1, row, column).match.id)
  assert.equal(match.winnerId, columnId)
  assert.deepEqual(match.result, { winnerSlot: 1, scoreA: 0, scoreB: 5 })
  assertStanding(api, rowId, { played: 1, wins: 0, losses: 1, pointsFor: 0, pointsAgainst: 5, diff: -5 })
  assertStanding(api, columnId, { played: 1, wins: 1, losses: 0, pointsFor: 5, pointsAgainst: 0, diff: 5 })
  const reread = getCell(api, 1, row, column)
  assert.equal(reread.scoreRow, 0)
  assert.equal(reread.scoreColumn, 5)
})

test('QA 整合 b：反向配對格子輸入後，對戰卡資料的 scoreA/scoreB 依排程 A/B 順序（已翻轉）', () => {
  const api = setupPrelim()
  for (const groupIndex of [0, 1]) {
    const { row, column, rowId, columnId } = findCell(api, groupIndex, 1)
    const cell = getCell(api, groupIndex, row, column)
    assert.equal(cell.match.playerA, columnId, '反向配對：排程 playerA 是欄選手')
    assert.equal(cell.match.playerB, rowId)

    // 列選手 6 分、欄選手 9 分 → 欄選手（playerA，slot 0）勝
    assert.equal(saveFromCrossTable(api, cell, 6, 9), 'set-result')
    const match = getMatch(api, cell.match.id)
    assert.equal(match.winnerId, columnId)
    assert.deepEqual(match.result, { winnerSlot: 0, scoreA: 9, scoreB: 6 })
    assertStanding(api, columnId, { played: 1, wins: 1, losses: 0, pointsFor: 9, pointsAgainst: 6, diff: 3 })
    assertStanding(api, rowId, { played: 1, wins: 0, losses: 1, pointsFor: 6, pointsAgainst: 9, diff: -3 })

    const reread = getCell(api, groupIndex, row, column)
    assert.equal(reread.scoreRow, 6)
    assert.equal(reread.scoreColumn, 9)
  }
})

test('QA 整合 b：反向配對格子由列選手獲勝時 winnerSlot 為 1、比分翻轉', () => {
  const api = setupPrelim()
  const { row, column, rowId } = findCell(api, 0, 1)
  const cell = getCell(api, 0, row, column)
  assert.equal(saveFromCrossTable(api, cell, 11, 2), 'set-result')
  const match = getMatch(api, cell.match.id)
  assert.equal(match.winnerId, rowId)
  assert.deepEqual(match.result, { winnerSlot: 1, scoreA: 2, scoreB: 11 })
})

test('QA 整合 c：修改比分但勝方不變走 updatePrelimScore，保留勝方、比分更新', () => {
  const api = setupPrelim()
  const { forward, reversed } = findDisjointCells(api, 0)

  assert.equal(saveFromCrossTable(api, getCell(api, 0, forward.row, forward.column), 11, 7), 'set-result')
  assert.equal(saveFromCrossTable(api, getCell(api, 0, reversed.row, reversed.column), 6, 9), 'set-result')

  // 正向：列選手仍勝
  let cell = getCell(api, 0, forward.row, forward.column)
  assert.equal(saveFromCrossTable(api, cell, 11, 3), 'update-score')
  let match = getMatch(api, cell.match.id)
  assert.equal(match.winnerId, forward.rowId)
  assert.deepEqual(match.result, { winnerSlot: 0, scoreA: 11, scoreB: 3 })
  assertStanding(api, forward.rowId, { played: 1, wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 3, diff: 8 })
  assertStanding(api, forward.columnId, { played: 1, wins: 0, losses: 1, pointsFor: 3, pointsAgainst: 11, diff: -8 })

  // 反向：欄選手仍勝
  cell = getCell(api, 0, reversed.row, reversed.column)
  assert.equal(saveFromCrossTable(api, cell, 4, 12), 'update-score')
  match = getMatch(api, cell.match.id)
  assert.equal(match.winnerId, reversed.columnId)
  assert.deepEqual(match.result, { winnerSlot: 0, scoreA: 12, scoreB: 4 })
  assertStanding(api, reversed.columnId, { played: 1, wins: 1, losses: 0, pointsFor: 12, pointsAgainst: 4, diff: 8 })
  assertStanding(api, reversed.rowId, { played: 1, wins: 0, losses: 1, pointsFor: 4, pointsAgainst: 12, diff: -8 })
  // 正向那場的名次不受反向修改影響
  assertStanding(api, forward.rowId, { played: 1, wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 3, diff: 8 })
  const reread = getCell(api, 0, reversed.row, reversed.column)
  assert.equal(reread.scoreRow, 4)
  assert.equal(reread.scoreColumn, 12)

  // 再存一次完全相同的比分也不會刪除結果
  assert.equal(saveFromCrossTable(api, reread, 4, 12), 'update-score')
  assert.deepEqual(getMatch(api, cell.match.id).result, { winnerSlot: 0, scoreA: 12, scoreB: 4 })
})

test('QA 整合 c：對戰卡只點勝方（比分為 null）後，交叉表補比分且勝方相同走 updatePrelimScore', () => {
  const api = setupPrelim()
  const { row, column, rowId } = findCell(api, 1, 1)
  const before = getCell(api, 1, row, column)
  api.setPrelimResult(before.match.id, before.rowSlot)

  const cell = getCell(api, 1, row, column)
  assert.equal(cell.match.winnerId, rowId)
  assert.equal(cell.scoreRow, null)
  assert.equal(cell.scoreColumn, null)

  assert.equal(saveFromCrossTable(api, cell, 3, 1), 'update-score')
  const match = getMatch(api, cell.match.id)
  assert.equal(match.winnerId, rowId)
  assert.deepEqual(match.result, { winnerSlot: 1, scoreA: 1, scoreB: 3 })
})

test('QA 整合 d：修改比分讓勝方改變走 setPrelimResult，勝方與比分更新且結果不會被 toggle 刪除', () => {
  const api = setupPrelim()
  const forward = findCell(api, 0, 0)
  const reversed = findCell(api, 1, 1)

  // 正向：列勝 → 欄勝
  assert.equal(saveFromCrossTable(api, getCell(api, 0, forward.row, forward.column), 11, 7), 'set-result')
  let cell = getCell(api, 0, forward.row, forward.column)
  assert.equal(saveFromCrossTable(api, cell, 5, 11), 'set-result')
  let match = getMatch(api, cell.match.id)
  assert.ok(match.result, '結果不應被刪除')
  assert.equal(match.winnerId, forward.columnId)
  assert.deepEqual(match.result, { winnerSlot: 1, scoreA: 5, scoreB: 11 })
  assertStanding(api, forward.rowId, { played: 1, wins: 0, losses: 1, pointsFor: 5, pointsAgainst: 11, diff: -6 })
  assertStanding(api, forward.columnId, { played: 1, wins: 1, losses: 0, pointsFor: 11, pointsAgainst: 5, diff: 6 })

  // 再改回列勝
  cell = getCell(api, 0, forward.row, forward.column)
  assert.equal(saveFromCrossTable(api, cell, 8, 6), 'set-result')
  match = getMatch(api, cell.match.id)
  assert.equal(match.winnerId, forward.rowId)
  assert.deepEqual(match.result, { winnerSlot: 0, scoreA: 8, scoreB: 6 })
  assertStanding(api, forward.rowId, { played: 1, wins: 1, losses: 0, pointsFor: 8, pointsAgainst: 6, diff: 2 })

  // 反向：欄勝 → 列勝
  assert.equal(saveFromCrossTable(api, getCell(api, 1, reversed.row, reversed.column), 6, 9), 'set-result')
  cell = getCell(api, 1, reversed.row, reversed.column)
  assert.equal(saveFromCrossTable(api, cell, 10, 2), 'set-result')
  match = getMatch(api, cell.match.id)
  assert.ok(match.result, '結果不應被刪除')
  assert.equal(match.winnerId, reversed.rowId)
  assert.deepEqual(match.result, { winnerSlot: 1, scoreA: 2, scoreB: 10 })
  assertStanding(api, reversed.rowId, { played: 1, wins: 1, losses: 0, pointsFor: 10, pointsAgainst: 2, diff: 8 })
  assertStanding(api, reversed.columnId, { played: 1, wins: 0, losses: 1, pointsFor: 2, pointsAgainst: 10, diff: -8 })
  const reread = getCell(api, 1, reversed.row, reversed.column)
  assert.equal(reread.scoreRow, 10)
  assert.equal(reread.scoreColumn, 2)
})

test('QA 整合 d：平手改選另一位勝者走 setPrelimResult、平手未選勝者不送出', () => {
  const api = setupPrelim()
  const { row, column, rowId, columnId } = findCell(api, 0, 1)

  assert.equal(saveFromCrossTable(api, getCell(api, 0, row, column), 8, 8), 'skipped')
  assert.equal(getCell(api, 0, row, column).match.result, null)

  assert.equal(saveFromCrossTable(api, getCell(api, 0, row, column), 8, 8, 'row'), 'set-result')
  let match = getMatch(api, getCell(api, 0, row, column).match.id)
  assert.equal(match.winnerId, rowId)
  assert.deepEqual(match.result, { winnerSlot: 1, scoreA: 8, scoreB: 8 })

  assert.equal(saveFromCrossTable(api, getCell(api, 0, row, column), 8, 8, 'column'), 'set-result')
  match = getMatch(api, match.id)
  assert.ok(match.result)
  assert.equal(match.winnerId, columnId)
  assert.deepEqual(match.result, { winnerSlot: 0, scoreA: 8, scoreB: 8 })
  assertStanding(api, columnId, { played: 1, wins: 1, losses: 0, pointsFor: 8, pointsAgainst: 8, diff: 0 })
})

test('QA 整合 e：用對戰卡方式（setPrelimResult 再 updatePrelimScore）設定結果，交叉表比分順序正確', () => {
  const api = setupPrelim()
  const reversed = findCell(api, 0, 1)
  const forward = findCell(api, 1, 0)

  // 反向配對：對戰卡上 A = 欄選手；點 A 勝並輸入 A 9 : B 4
  const reversedId = getCell(api, 0, reversed.row, reversed.column).match.id
  api.setPrelimResult(reversedId, 0)
  api.updatePrelimScore(reversedId, 9, 4)
  let cell = getCell(api, 0, reversed.row, reversed.column)
  assert.equal(cell.match.winnerId, reversed.columnId)
  assert.equal(cell.scoreRow, 4)
  assert.equal(cell.scoreColumn, 9)

  // 正向配對：對戰卡上 A = 列選手；點 B 勝並輸入 A 0 : B 7
  const forwardId = getCell(api, 1, forward.row, forward.column).match.id
  api.setPrelimResult(forwardId, 1)
  api.updatePrelimScore(forwardId, 0, 7)
  cell = getCell(api, 1, forward.row, forward.column)
  assert.equal(cell.match.winnerId, forward.columnId)
  assert.equal(cell.scoreRow, 0)
  assert.equal(cell.scoreColumn, 7)

  // 交叉表再存同樣比分 → 勝方不變走 update-score，結果維持不變
  assert.equal(saveFromCrossTable(api, cell, 0, 7), 'update-score')
  assert.deepEqual(getMatch(api, forwardId).result, { winnerSlot: 1, scoreA: 0, scoreB: 7 })
})

test('QA 整合 f：全部比賽用交叉表填完後可產生淘汰賽，之後鎖定不再改變預賽結果', () => {
  const api = setupPrelim()
  const groups = api.currentBracket.value.prelim.groups
  const expected = new Map()
  let index = 0

  groups.forEach((group, groupIndex) => {
    for (const [row, column] of upperCells(group.playerIds.length)) {
      // 交替讓列/欄獲勝，並穿插 0 分與平手指定勝者
      const variant = index % 4
      const [scoreRow, scoreColumn, tieWinner] =
        variant === 0 ? [11, index % 9] : variant === 1 ? [index % 9, 11] : variant === 2 ? [0, 3] : [5, 5, 'row']
      const cell = getCell(api, groupIndex, row, column)
      assert.equal(saveFromCrossTable(api, cell, scoreRow, scoreColumn, tieWinner), 'set-result', `${groupIndex}:(${row},${column})`)
      expected.set(`${groupIndex}:${row},${column}`, { scoreRow, scoreColumn, tieWinner })
      index += 1
    }
  })
  assert.equal(index, 10 + 6)

  let bracket = api.currentBracket.value
  assert.equal(isPrelimComplete(bracket.prelim), true)
  const qualification = getPrelimQualification(bracket.prelim, bracket.players)
  assert.equal(qualification.complete, true)
  assert.equal(qualification.knockoutSize, 4)
  assert.equal(qualification.qualifiers.length, 4)

  // 每格讀回的比分與輸入一致
  groups.forEach((group, groupIndex) => {
    for (const [row, column] of upperCells(group.playerIds.length)) {
      const { scoreRow, scoreColumn, tieWinner } = expected.get(`${groupIndex}:${row},${column}`)
      const cell = getCell(api, groupIndex, row, column)
      assert.equal(cell.scoreRow, scoreRow)
      assert.equal(cell.scoreColumn, scoreColumn)
      const winnerIsRow = scoreRow === scoreColumn ? tieWinner === 'row' : scoreRow > scoreColumn
      assert.equal(cell.match.winnerId, winnerIsRow ? group.playerIds[row] : group.playerIds[column])
    }
  })

  // 每位選手的勝敗場數加總一致
  const standings = getPrelimStandings(bracket.prelim, bracket.players)
  standings.forEach((group) => {
    const size = group.rows.length
    group.rows.forEach((row) => assert.equal(row.played, size - 1))
    assert.equal(
      group.rows.reduce((sum, row) => sum + row.wins, 0),
      (size * (size - 1)) / 2,
    )
  })

  assert.deepEqual(api.generateKnockoutFromPrelim(), { ok: true, errors: [] })
  bracket = api.currentBracket.value
  assert.equal(bracket.status, 'ready')
  assert.equal(bracket.slots.length, 4)
  assert.deepEqual(
    [...bracket.slots].sort(),
    qualification.qualifiers.map((entry) => entry.playerId).sort(),
  )

  // 鎖定後（App.vue 以 status === 'ready' 當 locked）直接呼叫 composable 也不改變預賽結果
  const lockedResults = cloneRaw(bracket.prelim.results)
  const firstMatch = getPrelimMatches(bracket.prelim)[0]
  api.setPrelimResult(firstMatch.id, 1 - firstMatch.result.winnerSlot, { scoreA: 1, scoreB: 99 })
  api.setPrelimResult(firstMatch.id, firstMatch.result.winnerSlot) // 同勝方，未鎖定時會 toggle 刪除
  api.updatePrelimScore(firstMatch.id, 42, 0)

  // 交叉表 helper 在鎖定後送出也一樣不生效
  const cell = getCell(api, 0, 0, 1)
  saveFromCrossTable(api, cell, cell.scoreColumn, cell.scoreRow + 1)

  bracket = api.currentBracket.value
  assert.equal(bracket.status, 'ready')
  assert.deepEqual(bracket.prelim.results, lockedResults)
  assert.equal(isPrelimComplete(bracket.prelim), true)
})

test('QA 整合 g：generateBracket 產生的分組與排程等同直接呼叫 usePrelimEngine，且填比分不改變排程', () => {
  const api = setupPrelim()
  const bracket = api.currentBracket.value

  assert.equal(bracket.prelim.groupSize, normalizePrelimGroupSize(GROUP_SIZE, PLAYER_COUNT))
  const expectedGroups = createPrelimGroups(bracket.players, GROUP_SIZE, 'order')
  assert.deepEqual(bracket.prelim.groups, expectedGroups)

  const scheduleFromStore = getPrelimMatches(bracket.prelim)
  const scheduleFromEngine = getPrelimMatches({ groups: expectedGroups, results: {} })
  assert.deepEqual(scheduleFromStore, scheduleFromEngine)
  assert.deepEqual(scheduleOf(scheduleFromStore), expectedScheduleFor(bracket.prelim.groups))

  // 用交叉表填完所有比賽後，分組與排程（id、A/B、輪次）都不變
  const groupsBefore = cloneRaw(bracket.prelim.groups)
  bracket.prelim.groups.forEach((group, groupIndex) => {
    for (const [row, column] of upperCells(group.playerIds.length)) {
      saveFromCrossTable(api, getCell(api, groupIndex, row, column), row + 1, column + 3)
    }
  })
  const after = api.currentBracket.value
  assert.deepEqual(after.prelim.groups, groupsBefore)
  assert.deepEqual(scheduleOf(getPrelimMatches(after.prelim)), scheduleOf(scheduleFromStore))
  assert.equal(Object.keys(after.prelim.results).length, scheduleFromStore.length)
})
