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
// 不提供 window / document：@vueuse 的 isClient 為 false，
// 因此 useStorage 只會對「明確傳入 localStorage」的 brackets 做持久化，
// currentId 與 openTabIds 會是一般 ref（不寫入 storage），也不會註冊 storage 事件監聽。
// 重新載入時 normalizeOpenTabs 會改用第一個賽程當目前賽程，測試中每次只有一個賽程，足以模擬重新載入。
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

const { effectScope, nextTick } = await import('vue')
const { useBrackets } = await import('../src/composables/useBrackets.js')
const { createFreeSlots, createGroupedSlots, normalizeFreeSlotCount } = await import(
  '../src/composables/useBracketEngine.js'
)
// 以 destructuring 取用：修正前不存在的匯出只會是 undefined，不會讓整個檔案載入失敗
const { getPendingPrelimGroupSizeError, getPrelimPlan, resolveCustomPrelimGroupSizeInput } = await import(
  '../src/composables/usePrelimEngine.js'
)

const STORAGE_BRACKETS = 'battletree:brackets'
const scopes = []

function mountBrackets() {
  const scope = effectScope()
  const api = scope.run(() => useBrackets())
  scopes.push(scope)
  return { api, stop: () => scope.stop() }
}

// useStorage 的 watch flush 為 'pre'，元件外會延到 microtask 才寫入 storage
async function flushStorage() {
  await nextTick()
  await nextTick()
}

function readStoredBrackets() {
  return JSON.parse(storage.getItem(STORAGE_BRACKETS) ?? '{}')
}

beforeEach(() => {
  storage.clear()
})

afterEach(() => {
  while (scopes.length) scopes.pop().stop()
})

// storage 清空後 useBrackets() 會自動建立唯一一個初始賽程並設為目前賽程
function setupPrelim(playerCount, groupSize) {
  const { api, stop } = mountBrackets()
  assert.equal(Object.keys(api.brackets.value).length, 1)
  assert.ok(api.currentBracket.value)
  api.setPlayerCount(playerCount)
  api.setFormat('prelim')
  if (groupSize !== undefined) api.setPrelimGroupSize(groupSize)
  return { api, stop }
}

test('useBrackets：16 人預賽 setPrelimGroupSize(6) 後 prelimGroupSize 為 6', () => {
  const { api } = setupPrelim(16, 6)
  assert.equal(api.currentBracket.value.format, 'prelim')
  assert.equal(api.currentBracket.value.players.length, 16)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
})

test('useBrackets：自訂值寫入 localStorage 後重新載入（normalizeBracket）仍為 6', async () => {
  const { api, stop } = setupPrelim(16, 6)
  const id = api.currentId.value
  await flushStorage()

  assert.equal(readStoredBrackets()[id].prelimGroupSize, 6)

  stop()
  const { api: reloaded } = mountBrackets()
  assert.equal(reloaded.currentId.value, id)
  assert.equal(reloaded.currentBracket.value.prelimGroupSize, 6)
  assert.equal(reloaded.currentBracket.value.format, 'prelim')
  assert.equal(reloaded.currentBracket.value.players.length, 16)
})

test('useBrackets：不合法的 setPrelimGroupSize 不改變狀態（仍為 6）', () => {
  const { api } = setupPrelim(16, 6)
  const before = api.currentBracket.value

  for (const invalid of [2, 9, 6.5, 'abc', NaN]) {
    api.setPrelimGroupSize(invalid)
    assert.equal(api.currentBracket.value.prelimGroupSize, 6, `setPrelimGroupSize(${String(invalid)})`)
  }
  // 不合法值應直接略過，不觸發任何更新
  assert.equal(api.currentBracket.value.updatedAt, before.updatedAt)
})

test('useBrackets：6 人時 setPrelimGroupSize(5) 仍可套用，產生 1 組 6 人', () => {
  const { api } = setupPrelim(6, 5)
  assert.equal(api.currentBracket.value.prelimGroupSize, 5)

  const result = api.generateBracket()
  assert.deepEqual(result, { ok: true, errors: [] })
  const { prelim } = api.currentBracket.value
  assert.equal(prelim.groupSize, 5)
  assert.deepEqual(prelim.groups.map((group) => group.playerIds.length), [6])
})

test('useBrackets：8 人時 setPrelimGroupSize(5) 仍可套用，產生 2 組', () => {
  const { api } = setupPrelim(8, 5)
  assert.equal(api.currentBracket.value.prelimGroupSize, 5)

  api.generateBracket()
  const { prelim } = api.currentBracket.value
  assert.equal(prelim.groupSize, 5)
  assert.deepEqual(prelim.groups.map((group) => group.playerIds.length), [4, 4])
})

test('useBrackets：generateBracket 後 prelim.groupSize 為自訂值且組數符合公式', async () => {
  const { api, stop } = setupPrelim(16, 6)
  const result = api.generateBracket()
  assert.deepEqual(result, { ok: true, errors: [] })

  const bracket = api.currentBracket.value
  const expectedGroupCount = Math.max(1, Math.round(16 / 6))
  assert.equal(bracket.status, 'prelim')
  assert.equal(bracket.prelim.groupSize, 6)
  assert.equal(bracket.prelim.groups.length, expectedGroupCount)
  assert.deepEqual(bracket.prelim.groups.map((group) => group.playerIds.length), [6, 5, 5])
  const allIds = bracket.prelim.groups.flatMap((group) => group.playerIds)
  assert.deepEqual([...allIds].sort(), bracket.players.map((player) => player.id).sort())

  // 重新載入後 prelim.groupSize 也要保留
  const id = api.currentId.value
  await flushStorage()
  stop()
  const { api: reloaded } = mountBrackets()
  assert.equal(reloaded.currentId.value, id)
  assert.equal(reloaded.currentBracket.value.prelimGroupSize, 6)
  assert.equal(reloaded.currentBracket.value.prelim.groupSize, 6)
  assert.equal(reloaded.currentBracket.value.prelim.groups.length, expectedGroupCount)
})

test('useBrackets：切到自由編排（free）後 generateBracket 不受 prelimGroupSize 影響', () => {
  const { api } = setupPrelim(16, 6)
  api.setFormat('free')
  assert.equal(api.currentBracket.value.format, 'free')

  assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
  const withCustom = api.currentBracket.value
  const slotCount = normalizeFreeSlotCount(withCustom.freeSlotCount, 16)
  const expected = createFreeSlots(withCustom.players, 'order', slotCount)

  assert.equal(withCustom.status, 'ready')
  assert.equal(withCustom.prelim, null)
  assert.equal(withCustom.groupCount, 1)
  assert.equal(withCustom.bracketSize, expected.bracketSize)
  assert.deepEqual(withCustom.slots, expected.slots)

  // 對照組：同一份名單、prelimGroupSize 為預設 3，產生結果應完全相同
  api.setFormat('prelim')
  api.setPrelimGroupSize(3)
  api.setFormat('free')
  api.generateBracket()
  const withDefault = api.currentBracket.value
  assert.equal(withDefault.prelimGroupSize, 3)
  assert.equal(withDefault.bracketSize, withCustom.bracketSize)
  assert.deepEqual(withDefault.slots, withCustom.slots)
})

test('useBrackets：切到單淘汰（single）後 generateBracket 不受 prelimGroupSize 影響', () => {
  const { api } = setupPrelim(16, 6)
  api.setFormat('single')
  assert.equal(api.currentBracket.value.format, 'single')

  assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
  const withCustom = api.currentBracket.value
  const { slotsData } = createGroupedSlots(withCustom.players, 'order', withCustom.groupCount)

  assert.equal(withCustom.status, 'ready')
  assert.equal(withCustom.prelim, null)
  assert.equal(withCustom.bracketSize, slotsData.bracketSize)
  assert.deepEqual(withCustom.slots, slotsData.slots)

  api.setFormat('prelim')
  api.setPrelimGroupSize(3)
  api.setFormat('single')
  api.generateBracket()
  const withDefault = api.currentBracket.value
  assert.equal(withDefault.prelimGroupSize, 3)
  assert.equal(withDefault.bracketSize, withCustom.bracketSize)
  assert.deepEqual(withDefault.slots, withCustom.slots)
})

test('useBrackets：[記錄目前行為，規格未定義] 16 人自訂 8 後人數降為 10，prelimGroupSize 變回 3', () => {
  const { api } = setupPrelim(16, 8)
  assert.equal(api.currentBracket.value.prelimGroupSize, 8)

  api.setPlayerCount(10)
  // 目前行為：setPlayerCount 不調整 prelimGroupSize，persist 時 normalizeBracket 以新人數重新驗證，
  // 8 > floor(10 / 2) = 5 判定不合法，退回預設 3（不是夾到上限 5）。
  assert.equal(api.currentBracket.value.players.length, 10)
  assert.equal(api.currentBracket.value.prelimGroupSize, 3)
})

// ---- 回歸：24 人自訂每組 6 人卻產生 8 組×3 人 ----

function playerNames(count) {
  return Array.from({ length: count }, (_, index) => `Player${index + 1}`)
}

function assertFourGroupsOfSix(api) {
  const result = api.generateBracket()
  assert.deepEqual(result, { ok: true, errors: [] })
  const bracket = api.currentBracket.value
  assert.equal(bracket.status, 'prelim')
  assert.equal(bracket.players.length, 24)
  assert.deepEqual(bracket.prelim.groups.map((group) => group.playerIds.length), [6, 6, 6, 6])
  assert.equal(bracket.prelim.groupSize, 6)
  // 設定頁摘要（getPrelimPlan）要和實際分組一致
  const plan = getPrelimPlan(bracket.players.length, bracket.prelimGroupSize)
  assert.equal(plan.groupCount, bracket.prelim.groups.length)
  assert.deepEqual(plan.groupSizes, bracket.prelim.groups.map((group) => group.playerIds.length))
  const allIds = bracket.prelim.groups.flatMap((group) => group.playerIds)
  assert.deepEqual([...allIds].sort(), bracket.players.map((player) => player.id).sort())
}

test('回歸：24 人自訂 6，名單暫時變少（匯入 10 人）再匯入 24 人、重新載入後產生，應為 4 組×6 人', async () => {
  const { api, stop } = setupPrelim(24, 6)
  api.importPlayers(playerNames(10))
  api.importPlayers(playerNames(24))
  const id = api.currentId.value
  await flushStorage()
  stop()

  const { api: reloaded } = mountBrackets()
  assert.equal(reloaded.currentId.value, id)
  assert.equal(reloaded.currentBracket.value.prelimGroupSize, 6)
  assertFourGroupsOfSix(reloaded)
})

test('回歸：24 人自訂 6，人數欄位清空（setPlayerCount 退到 2 人）再改回 24 人，應為 4 組×6 人', () => {
  const { api } = setupPrelim(24, 6)
  api.setPlayerCount(2)
  api.setPlayerCount(24)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  assertFourGroupsOfSix(api)
})

test('回歸：24 人自訂 6，移除到 11 人再逐一新增回 24 人，應為 4 組×6 人', () => {
  const { api } = setupPrelim(24, 6)
  while (api.currentBracket.value.players.length > 11) {
    api.removePlayer(api.currentBracket.value.players.at(-1).id)
  }
  while (api.currentBracket.value.players.length < 24) api.addPlayer()
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  assertFourGroupsOfSix(api)
})

test('回歸：預設 4 人時先輸入 6（被擋下），再把人數改成 24，輸入框的 6 應套用並產生 4 組×6 人', () => {
  const { api } = setupPrelim(4)
  // 4 人時 6 不合法：設定頁擋下並提示，不寫入狀態
  const blocked = resolveCustomPrelimGroupSizeInput('6', api.currentBracket.value.players.length)
  assert.equal(blocked.size, null)
  assert.ok(blocked.error)
  assert.equal(api.currentBracket.value.prelimGroupSize, 3)

  // 人數改成 24 後，設定頁以同一個輸入值重新判斷，合法就套用（輸入框顯示值＝實際存的值）
  api.setPlayerCount(24)
  const pending = resolveCustomPrelimGroupSizeInput('6', api.currentBracket.value.players.length)
  assert.deepEqual(pending, { size: 6, error: '' })
  api.setPrelimGroupSize(pending.size)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  assertFourGroupsOfSix(api)
})

test('回歸：自訂 6 後人數降為 10（不合法），保留自訂值、明確提示並擋下產生；重新載入後仍擋下', async () => {
  const { api, stop } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  const bracket = api.currentBracket.value
  assert.equal(bracket.prelimCustomGroupSize, 6)
  const notice = getPendingPrelimGroupSizeError(bracket.prelimCustomGroupSize, bracket.players.length)
  assert.match(notice, /6/)
  assert.match(notice, /10/)

  const result = api.generateBracket()
  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [notice])
  assert.equal(api.currentBracket.value.status, 'setup')
  assert.equal(api.currentBracket.value.prelim, null)

  const id = api.currentId.value
  await flushStorage()
  stop()
  const { api: reloaded } = mountBrackets()
  assert.equal(reloaded.currentId.value, id)
  assert.equal(reloaded.currentBracket.value.prelimCustomGroupSize, 6)
  assert.equal(reloaded.generateBracket().ok, false)

  // 改選預設 5 人後解除自訂值，10 人產生 2 組×5 人
  reloaded.setPrelimGroupSize(5)
  assert.equal(reloaded.currentBracket.value.prelimCustomGroupSize, null)
  assert.deepEqual(reloaded.generateBracket(), { ok: true, errors: [] })
  assert.deepEqual(reloaded.currentBracket.value.prelim.groups.map((group) => group.playerIds.length), [5, 5])
})

test('回歸：舊資料（只有 prelimGroupSize: 6）重新載入後，人數變少仍保留自訂值並擋下產生', async () => {
  const { api, stop } = setupPrelim(24, 6)
  const id = api.currentId.value
  await flushStorage()
  const legacy = { ...readStoredBrackets()[id] }
  delete legacy.prelimCustomGroupSize
  stop()
  storage.setItem(STORAGE_BRACKETS, JSON.stringify({ [id]: legacy }))

  const { api: reloaded } = mountBrackets()
  assert.equal(reloaded.currentBracket.value.prelimGroupSize, 6)
  reloaded.setPlayerCount(10)
  assert.equal(reloaded.generateBracket().ok, false)
  reloaded.setPlayerCount(24)
  assertFourGroupsOfSix(reloaded)
})

test('回歸：24 人選預設 3／4／5 的分組不變', () => {
  const expected = { 3: [3, 3, 3, 3, 3, 3, 3, 3], 4: [4, 4, 4, 4, 4, 4], 5: [5, 5, 5, 5, 4] }
  for (const size of [3, 4, 5]) {
    const { api, stop } = setupPrelim(24, 6)
    api.setPrelimGroupSize(size)
    assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
    assert.deepEqual(
      api.currentBracket.value.prelim.groups.map((group) => group.playerIds.length),
      expected[size],
      `每組約 ${size} 人`,
    )
    stop()
    storage.clear()
  }
})
