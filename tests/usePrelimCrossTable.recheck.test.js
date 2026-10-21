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
const { getPrelimMatches } = await import('../src/composables/usePrelimEngine.js')
const {
  getPrelimCrossTableCell,
  getPrelimCrossTableSelectionCell,
  getPrelimMatchResultFromCell,
  isPrelimCrossTableSelectionCurrent,
} = await import('../src/composables/usePrelimCrossTable.js')

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

// 9 人、每組 4 人 → round(9 / 4) = 2 組，人數 [5, 4]
const PLAYER_COUNT = 9
const GROUP_SIZE = 4
const DRAW_COUNT = 30

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

// reactive proxy 不能 structuredClone，所以逐層 toRaw 後複製；保留值為 undefined 的 key
function cloneRaw(value) {
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(cloneRaw)
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, cloneRaw(entry)]))
  }
  return raw
}

// 與 PrelimView.vue 相同：每組只傳該組的比賽給交叉表
function groupMatches(api, groupIndex) {
  return getPrelimMatches(api.currentBracket.value.prelim).filter((match) => match.groupIndex === groupIndex)
}

function allMatchIds(api) {
  return getPrelimMatches(api.currentBracket.value.prelim).map((match) => match.id).sort()
}

function upperCells(size) {
  const cells = []
  for (let row = 0; row < size; row += 1) {
    for (let column = row + 1; column < size; column += 1) cells.push([row, column])
  }
  return cells
}

// 與 PrelimCrossTable.vue 的 groupKey 相同公式：playerIds.join('|') + '#' + 排序後的比賽 id
function groupKey(playerIds, matches) {
  return `${playerIds.join('|')}#${matches.map((match) => match.id).sort().join('|')}`
}

// 模擬 openCell：selected = { ...cell, rowPlayerId, columnPlayerId }
function openCell(cell, rowPlayerId, columnPlayerId) {
  return { ...cell, rowPlayerId, columnPlayerId }
}

// 目前 bracket 中每一個上半部格子的 selected（含所屬組別）
function openAllCells(api) {
  const selections = []
  api.currentBracket.value.prelim.groups.forEach(({ playerIds }, groupIndex) => {
    const matches = groupMatches(api, groupIndex)
    for (const [row, column] of upperCells(playerIds.length)) {
      const cell = getPrelimCrossTableCell(playerIds, row, column, matches)
      assert.ok(cell, `第 ${groupIndex} 組 (${row}, ${column}) 應有格子`)
      selections.push({ groupIndex, selected: openCell(cell, playerIds[row], playerIds[column]) })
    }
  })
  return selections
}

function samePair(match, firstPlayerId, secondPlayerId) {
  return (
    (match.playerA === firstPlayerId && match.playerB === secondPlayerId) ||
    (match.playerA === secondPlayerId && match.playerB === firstPlayerId)
  )
}

// 可重現的 PRNG（mulberry32）
function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// shufflePlayers 有 crypto.getRandomValues 時會優先用它（Node 22 預設就有），
// 只換 Math.random 無法重現，所以兩者都暫時替換，finally 還原
function withSeededRandom(seed, run) {
  const next = mulberry32(seed)
  const originalRandom = Math.random
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const originalCrypto = globalThis.crypto
  const fakeCrypto = {
    getRandomValues(array) {
      for (let index = 0; index < array.length; index += 1) array[index] = Math.floor(next() * 2 ** 32)
      return array
    },
    randomUUID: originalCrypto?.randomUUID?.bind(originalCrypto),
  }
  Math.random = next
  if (!cryptoDescriptor || cryptoDescriptor.configurable) {
    Object.defineProperty(globalThis, 'crypto', { value: fakeCrypto, configurable: true, writable: true })
  }
  // 若 crypto 不可重新定義，退而求其次覆寫實例上的 getRandomValues
  const patchedInstance = cryptoDescriptor && !cryptoDescriptor.configurable
  const originalGetRandomValues = patchedInstance ? originalCrypto.getRandomValues : null
  if (patchedInstance) originalCrypto.getRandomValues = fakeCrypto.getRandomValues
  try {
    return run()
  } finally {
    Math.random = originalRandom
    if (patchedInstance) {
      originalCrypto.getRandomValues = originalGetRandomValues
    } else if (cryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
    } else {
      delete globalThis.crypto
    }
  }
}

// 以下複製 PrelimCrossTable.vue 的 validScore 邏輯（非直接測試元件；元件內的函式沒有匯出）：
//   value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0
// 輸入框是 <input v-model="rowScore" type="number">，Vue 的 v-model 在 type=number 時會以 parseFloat
// 嘗試轉型：可解析的值變成 number，無法解析時保留原字串（例如空欄位就是 ''），
// 所以 validScore 實際上可能收到 number 或 string 兩種型別。
function validScore(value) {
  const number = Number(value)
  return value !== '' && Number.isInteger(number) && number >= 0
}

// 模擬 PrelimCrossTable.vue 的 saveScore（只呼叫 composable，不經過元件），回傳實際走的路徑：
// 'closed'：重算格子為 null，關閉編輯框且不送出
// 'invalid' / 'need-tie-winner'：驗證失敗，不送出
// 'update-score'：勝方不變；'set-result'：勝方改變或原本無結果
function saveFromSelection(api, selected, matches, rowScore, columnScore, tieWinner = '') {
  const cell = getPrelimCrossTableSelectionCell(selected, matches)
  if (!cell) return { status: 'closed' }
  if (!validScore(rowScore) || !validScore(columnScore)) {
    return { status: 'invalid', error: '比分請輸入 0 以上的整數' }
  }
  const first = Number(rowScore)
  const second = Number(columnScore)
  if (first === second && !tieWinner) {
    return { status: 'need-tie-winner', error: '比分平手，請選擇勝者' }
  }
  const { winnerSlot, scoreA, scoreB } = getPrelimMatchResultFromCell(
    cell,
    first,
    second,
    tieWinner === 'row' ? cell.rowSlot : cell.columnSlot,
  )
  if (cell.match.result?.winnerSlot === winnerSlot) {
    api.updatePrelimScore(cell.match.id, scoreA, scoreB)
    return { status: 'update-score', matchId: cell.match.id, winnerSlot, scoreA, scoreB }
  }
  api.setPrelimResult(cell.match.id, winnerSlot, { scoreA, scoreB })
  return { status: 'set-result', matchId: cell.match.id, winnerSlot, scoreA, scoreB }
}

// 只記錄呼叫、不改狀態的假 api，用來檢查送出的參數
function createRecordingApi() {
  const calls = []
  return {
    calls,
    setPrelimResult: (...args) => calls.push(['set-result', ...args]),
    updatePrelimScore: (...args) => calls.push(['update-score', ...args]),
  }
}

function scoreOf(match, scoreA, scoreB, playerId) {
  if (match.playerA === playerId) return scoreA
  if (match.playerB === playerId) return scoreB
  throw new Error(`${playerId} 不在 ${match.id}`)
}

function winnerIdOf(match, winnerSlot) {
  if (winnerSlot === 0) return match.playerA
  if (winnerSlot === 1) return match.playerB
  return null
}

test('複驗：重新分組抽籤沿用比賽 id，換人的舊 selected 回傳 null、同一對選手依目前資料重算 rowSlot', () => {
  const api = setupPrelim()
  const originalIds = allMatchIds(api)
  assert.ok(originalIds.includes('p0-m0'))
  const selections = openAllCells(api)
  const originalGroups = cloneRaw(api.currentBracket.value.prelim.groups)
  const originalGroupMatches = originalGroups.map((_, groupIndex) => groupMatches(api, groupIndex))

  let changedCount = 0
  let samePairCount = 0
  let samePairSwappedCount = 0
  let groupOrderChangedCount = 0

  withSeededRandom(20261021, () => {
    for (let draw = 0; draw < DRAW_COUNT; draw += 1) {
      assert.deepEqual(api.generateBracket('random'), { ok: true, errors: [] }, `第 ${draw} 次抽籤應成功`)
      assert.deepEqual(allMatchIds(api), originalIds, `第 ${draw} 次抽籤後比賽 id 集合應沿用`)

      for (const { groupIndex, selected } of selections) {
        const matches = groupMatches(api, groupIndex)
        const current = matches.find((match) => match.id === selected.match.id)
        assert.ok(current, `第 ${draw} 次抽籤後 ${selected.match.id} 仍應存在於第 ${groupIndex} 組`)
        const cell = getPrelimCrossTableSelectionCell(selected, matches)
        const label = `第 ${draw} 次抽籤 ${selected.match.id}（${selected.rowPlayerId} 對 ${selected.columnPlayerId}）`

        if (!samePair(current, selected.rowPlayerId, selected.columnPlayerId)) {
          changedCount += 1
          assert.equal(cell, null, `${label} 已換人，應回傳 null`)
          assert.equal(isPrelimCrossTableSelectionCurrent(selected, matches), false, label)
          continue
        }

        samePairCount += 1
        assert.ok(cell, `${label} 選手相同，應回傳格子`)
        assert.equal(isPrelimCrossTableSelectionCurrent(selected, matches), true, label)
        const expectedRowSlot = current.playerA === selected.rowPlayerId ? 0 : 1
        if (expectedRowSlot !== selected.rowSlot) samePairSwappedCount += 1
        assert.equal(cell.match, current, `${label} 應指向目前的比賽物件`)
        assert.equal(cell.rowSlot, expectedRowSlot, `${label} rowSlot 應依目前資料重算`)
        assert.equal(cell.columnSlot, 1 - expectedRowSlot, label)
      }

      api.currentBracket.value.prelim.groups.forEach(({ playerIds }, groupIndex) => {
        const before = originalGroups[groupIndex].playerIds
        const matches = groupMatches(api, groupIndex)
        const orderChanged = before.join('|') !== playerIds.join('|')
        if (orderChanged) groupOrderChangedCount += 1
        // 同組比賽 id 不變，groupKey 是否變動完全取決於 playerIds 的順序
        assert.equal(
          groupKey(before, originalGroupMatches[groupIndex]) !== groupKey(playerIds, matches),
          orderChanged,
          `第 ${draw} 次抽籤第 ${groupIndex} 組：playerIds 順序變了 groupKey 就必須不同`,
        )
      })
    }
  })

  assert.ok(changedCount > 0, '至少要涵蓋一次「換人」情境')
  assert.ok(groupOrderChangedCount > 0, '至少要有一次 playerIds 順序變動')
  // 同一對選手（含先後對調）由隨機決定，次數僅供參考；先後對調的精確案例由手動建構的測試涵蓋
  assert.ok(samePairCount >= samePairSwappedCount)
})

test('複驗：重新分組後用舊 selected 送出，換人則預賽 results 完全不變', () => {
  const api = setupPrelim()
  const selections = openAllCells(api)
  let closedCount = 0

  withSeededRandom(1208, () => {
    for (let draw = 0; draw < DRAW_COUNT; draw += 1) {
      assert.deepEqual(api.generateBracket('random'), { ok: true, errors: [] })
      // 先在 results 放一筆資料，避免「results 本來就是空的」讓比對失去意義
      const seedMatch = groupMatches(api, 0)[0]
      api.setPrelimResult(seedMatch.id, 0, { scoreA: 3, scoreB: 1 })

      for (const { groupIndex, selected } of selections) {
        const matches = groupMatches(api, groupIndex)
        const current = matches.find((match) => match.id === selected.match.id)
        const before = cloneRaw(api.currentBracket.value.prelim.results)
        const outcome = saveFromSelection(api, selected, matches, 5, 2)
        const after = cloneRaw(api.currentBracket.value.prelim.results)
        const label = `第 ${draw} 次抽籤 ${selected.match.id}（${selected.rowPlayerId} 對 ${selected.columnPlayerId}）`

        if (!samePair(current, selected.rowPlayerId, selected.columnPlayerId)) {
          closedCount += 1
          assert.deepEqual(outcome, { status: 'closed' }, `${label} 已換人，不應送出`)
          assert.deepEqual(after, before, `${label} 已換人，results 應完全不變`)
          continue
        }

        // 同一對選手：照常寫入，且列選手拿到 5 分、為勝者
        assert.ok(outcome.status === 'set-result' || outcome.status === 'update-score', label)
        const written = getPrelimMatches(api.currentBracket.value.prelim).find((match) => match.id === selected.match.id)
        assert.equal(scoreOf(written, written.result.scoreA, written.result.scoreB, selected.rowPlayerId), 5, label)
        assert.equal(written.winnerId, selected.rowPlayerId, label)
      }
    }
  })

  assert.ok(closedCount > 0, '至少要涵蓋一次「換人」後送出')
})

for (const direction of ['forward', 'reversed']) {
  test(`複驗：同一 id 選手先後對調（起始方向 ${direction}），重算後列選手拿到 5 分且為勝者`, () => {
    const rowPlayerId = 'player-row'
    const columnPlayerId = 'player-column'
    const makeMatch = (playerA, playerB) => ({
      id: 'p0-m0',
      groupIndex: 0,
      playerA,
      playerB,
      winnerId: null,
      result: null,
    })
    const oldMatch = direction === 'forward' ? makeMatch(rowPlayerId, columnPlayerId) : makeMatch(columnPlayerId, rowPlayerId)
    const newMatch = direction === 'forward' ? makeMatch(columnPlayerId, rowPlayerId) : makeMatch(rowPlayerId, columnPlayerId)
    const oldRowSlot = direction === 'forward' ? 0 : 1

    const oldCell = getPrelimCrossTableCell([rowPlayerId, columnPlayerId], 0, 1, [oldMatch])
    assert.equal(oldCell.rowSlot, oldRowSlot)
    const selected = openCell(oldCell, rowPlayerId, columnPlayerId)

    const cell = getPrelimCrossTableSelectionCell(selected, [newMatch])
    assert.ok(cell)
    assert.equal(cell.match, newMatch)
    assert.equal(cell.rowSlot, 1 - oldRowSlot, 'rowSlot 應依對調後的資料重算')

    // 分出勝負：列選手 5、欄選手 2
    const decided = getPrelimMatchResultFromCell(cell, 5, 2)
    assert.equal(scoreOf(newMatch, decided.scoreA, decided.scoreB, selected.rowPlayerId), 5)
    assert.equal(scoreOf(newMatch, decided.scoreA, decided.scoreB, selected.columnPlayerId), 2)
    assert.equal(winnerIdOf(newMatch, decided.winnerSlot), selected.rowPlayerId)

    // 對照：若沿用舊的 selected（未重算），勝者與比分都會寫反
    const stale = getPrelimMatchResultFromCell(selected, 5, 2)
    assert.equal(winnerIdOf(newMatch, stale.winnerSlot), selected.columnPlayerId)

    // 平手指定列選手勝
    const tieRow = getPrelimMatchResultFromCell(cell, 3, 3, cell.rowSlot)
    assert.equal(winnerIdOf(newMatch, tieRow.winnerSlot), selected.rowPlayerId)
    assert.equal(scoreOf(newMatch, tieRow.scoreA, tieRow.scoreB, selected.rowPlayerId), 3)
    // 平手指定欄選手勝
    const tieColumn = getPrelimMatchResultFromCell(cell, 3, 3, cell.columnSlot)
    assert.equal(winnerIdOf(newMatch, tieColumn.winnerSlot), selected.columnPlayerId)

    // 經由模擬 saveScore 送出：原本無結果 → set-result，參數依對調後的 playerA/playerB
    const recorder = createRecordingApi()
    const outcome = saveFromSelection(recorder, selected, [newMatch], 5, 2)
    assert.equal(outcome.status, 'set-result')
    assert.deepEqual(recorder.calls, [['set-result', 'p0-m0', decided.winnerSlot, { scoreA: decided.scoreA, scoreB: decided.scoreB }]])

    const tieRecorder = createRecordingApi()
    assert.equal(saveFromSelection(tieRecorder, selected, [newMatch], 3, 3, 'row').status, 'set-result')
    assert.equal(winnerIdOf(newMatch, tieRecorder.calls[0][2]), selected.rowPlayerId)
  })
}

test('複驗：4、5 人組每個上半部格子，rowOutcome 為 win 當且僅當勝者是列選手', () => {
  const groups = [
    { label: 'A', playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
    { label: 'B', playerIds: ['b1', 'b2', 'b3', 'b4'] },
  ]
  const baseMatches = getPrelimMatches({ groups, results: {} })

  groups.forEach(({ playerIds }, groupIndex) => {
    const cells = upperCells(playerIds.length)
    assert.equal(cells.length, (playerIds.length * (playerIds.length - 1)) / 2)
    const rowSlots = new Set()

    for (const [row, column] of cells) {
      const rowPlayerId = playerIds[row]
      const label = `第 ${groupIndex} 組 (${row}, ${column})`
      const base = getPrelimCrossTableCell(playerIds, row, column, baseMatches.filter((match) => match.groupIndex === groupIndex))
      assert.ok(base, label)
      rowSlots.add(base.rowSlot)
      const matchId = base.match.id
      const cellWith = (result) => {
        const matches = getPrelimMatches({ groups, results: { [matchId]: result } })
          .filter((match) => match.groupIndex === groupIndex)
        return getPrelimCrossTableCell(playerIds, row, column, matches)
      }

      // 只點勝方、不填比分
      for (const winnerSlot of [0, 1]) {
        const cell = cellWith({ winnerSlot, scoreA: null, scoreB: null })
        const winnerId = winnerIdOf(cell.match, winnerSlot)
        assert.equal(cell.match.winnerId, winnerId, label)
        assert.equal(cell.rowOutcome === 'win', winnerId === rowPlayerId, `${label} winnerSlot=${winnerSlot}`)
        assert.equal(cell.rowOutcome, winnerId === rowPlayerId ? 'win' : 'loss', `${label} winnerSlot=${winnerSlot}`)
        assert.equal(cell.scoreRow, null, label)
        assert.equal(cell.scoreColumn, null, label)
      }

      // 沒有勝方
      assert.equal(cellWith({ winnerSlot: null, scoreA: null, scoreB: null }).rowOutcome, null, `${label} winnerSlot=null`)
      assert.equal(cellWith({ winnerSlot: undefined, scoreA: null, scoreB: null }).rowOutcome, null, `${label} winnerSlot=undefined`)
      assert.equal(base.rowOutcome, null, `${label} 無結果`)

      // 有比分：以列選手角度寫入，rowOutcome 與比分一致
      for (const [scoreRow, scoreColumn] of [[3, 1], [1, 3]]) {
        const result = getPrelimMatchResultFromCell(base, scoreRow, scoreColumn)
        const cell = cellWith(result)
        assert.equal(cell.scoreRow, scoreRow, label)
        assert.equal(cell.scoreColumn, scoreColumn, label)
        assert.equal(cell.rowOutcome, scoreRow > scoreColumn ? 'win' : 'loss', `${label} ${scoreRow}:${scoreColumn}`)
        assert.equal(cell.rowOutcome === 'win', cell.match.winnerId === rowPlayerId, label)
      }
    }

    assert.deepEqual([...rowSlots].sort(), [0, 1], `第 ${groupIndex} 組應同時涵蓋正向與反向格子`)
  })
})

test('複驗：validScore 複製邏輯的各種輸入，以及平手未選勝者', () => {
  // 注意：validScore 是複製元件邏輯，非直接測試 PrelimCrossTable.vue
  const cases = [
    ['', false],
    [-1, false],
    [1.5, false],
    ['abc', false], // v-model 無法解析時保留字串
    [Number.NaN, false],
    [0, true],
    [3, true],
    ['7', true],
  ]
  for (const [value, expected] of cases) {
    assert.equal(validScore(value), expected, `validScore(${typeof value === 'string' ? `'${value}'` : String(value)})`)
  }

  const match = { id: 'p0-m0', groupIndex: 0, playerA: 'x', playerB: 'y', winnerId: null, result: null }
  const selected = openCell(getPrelimCrossTableCell(['x', 'y'], 0, 1, [match]), 'x', 'y')

  for (const [rowScore, columnScore] of [['', 3], [3, ''], [-1, 3], [1.5, 3], ['abc', 3], [Number.NaN, 3]]) {
    const recorder = createRecordingApi()
    assert.deepEqual(
      saveFromSelection(recorder, selected, [match], rowScore, columnScore),
      { status: 'invalid', error: '比分請輸入 0 以上的整數' },
      `${String(rowScore)}:${String(columnScore)}`,
    )
    assert.deepEqual(recorder.calls, [])
  }

  const tieRecorder = createRecordingApi()
  assert.deepEqual(
    saveFromSelection(tieRecorder, selected, [match], 2, '2'),
    { status: 'need-tie-winner', error: '比分平手，請選擇勝者' },
  )
  assert.deepEqual(tieRecorder.calls, [])

  const okRecorder = createRecordingApi()
  assert.equal(saveFromSelection(okRecorder, selected, [match], 0, '7').status, 'set-result')
  assert.deepEqual(okRecorder.calls, [['set-result', 'p0-m0', 1, { scoreA: 0, scoreB: 7 }]])
})
