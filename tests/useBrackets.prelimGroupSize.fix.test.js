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

const { effectScope, nextTick, toRaw } = await import('vue')
const { useBrackets } = await import('../src/composables/useBrackets.js')
const {
  getPendingPrelimGroupSizeError,
  getPrelimPlan,
  normalizePrelimCustomGroupSize,
  resolveCustomPrelimGroupSizeInput,
} = await import('../src/composables/usePrelimEngine.js')

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

// 以 storage 中只有這一個賽程的狀態重新 mount（模擬重新載入）
function mountWithStoredBracket(bracket) {
  storage.clear()
  storage.setItem(STORAGE_BRACKETS, JSON.stringify({ [bracket.id]: bracket }))
  return mountBrackets()
}

// reactive 資料的深拷貝：逐層 toRaw 後複製成一般物件
function deepRaw(value) {
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(deepRaw)
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, deepRaw(item)]))
  }
  return raw
}

function omitKeys(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
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

function playerNames(count) {
  return Array.from({ length: count }, (_, index) => `Player${index + 1}`)
}

function groupSizesOf(bracket) {
  return bracket.prelim.groups.map((group) => group.playerIds.length)
}

// 產生預賽並驗證分組、摘要（getPrelimPlan）與實際分組一致、所有選手各出現一次
function assertPrelimGenerated(api, expectedSizes, forceMode) {
  const result = api.generateBracket(forceMode)
  assert.deepEqual(result, { ok: true, errors: [] })
  const bracket = api.currentBracket.value
  assert.equal(bracket.status, 'prelim')
  assert.deepEqual(groupSizesOf(bracket), expectedSizes)
  const plan = getPrelimPlan(bracket.players.length, bracket.prelimGroupSize)
  assert.equal(plan.groupCount, bracket.prelim.groups.length)
  assert.deepEqual(plan.groupSizes, groupSizesOf(bracket))
  const allIds = bracket.prelim.groups.flatMap((group) => group.playerIds)
  assert.deepEqual([...allIds].sort(), bracket.players.map((player) => player.id).sort())
  return bracket
}

function assertFourGroupsOfSix(api, forceMode) {
  const bracket = assertPrelimGenerated(api, [6, 6, 6, 6], forceMode)
  assert.equal(bracket.players.length, 24)
  assert.equal(bracket.prelimGroupSize, 6)
  assert.equal(bracket.prelim.groupSize, 6)
  return bracket
}

// 自訂值不合法（人數不足）時：自訂值保留、產生被擋下且錯誤訊息即為設定頁提示
function assertBlockedWithCustomSix(api, label = '') {
  const bracket = api.currentBracket.value
  assert.equal(bracket.prelimCustomGroupSize, 6, `${label} prelimCustomGroupSize`)
  const notice = getPendingPrelimGroupSizeError(bracket.prelimCustomGroupSize, bracket.players.length)
  assert.ok(notice, `${label} 應有提示`)
  const result = api.generateBracket()
  assert.equal(result.ok, false, `${label} generateBracket 應被擋下`)
  assert.deepEqual(result.errors, [notice], `${label} errors`)
  assert.equal(api.currentBracket.value.status, 'setup', `${label} status`)
  assert.equal(api.currentBracket.value.prelim, null, `${label} prelim`)
}

// ---- 1. 純函式 ----

test('修正驗證：normalizePrelimCustomGroupSize 只保留非 3／4／5 的整數自訂值', () => {
  for (const preset of [3, 4, 5]) {
    assert.equal(normalizePrelimCustomGroupSize(preset), null, `預設 ${preset}`)
  }
  for (const custom of [6, 7, 100]) {
    assert.equal(normalizePrelimCustomGroupSize(custom), custom, `自訂 ${custom}`)
  }
  for (const invalid of [2, 6.5, NaN, 'abc', null, undefined]) {
    assert.equal(normalizePrelimCustomGroupSize(invalid), null, `不合法 ${String(invalid)}`)
  }
  // 照實作：以 Number() 轉換，字串 '6' 視為 6
  assert.equal(normalizePrelimCustomGroupSize('6'), 6)
})

test('修正驗證：getPendingPrelimGroupSizeError 未自訂或合法時回空字串，不合法時提示自訂值與目前人數', () => {
  assert.equal(getPendingPrelimGroupSizeError(null, 10), '')
  assert.equal(getPendingPrelimGroupSizeError(undefined, 10), '')
  assert.equal(getPendingPrelimGroupSizeError(6, 12), '')
  assert.equal(getPendingPrelimGroupSizeError(6, 24), '')
  assert.equal(getPendingPrelimGroupSizeError(12, 24), '')

  const notice = getPendingPrelimGroupSizeError(6, 10)
  assert.ok(notice.includes('自訂每組 6 人'), notice)
  assert.ok(notice.includes('目前 10 人'), notice)
  assert.equal(notice, '自訂每組 6 人至少需要 12 位參賽者（目前 10 人），請增加參賽人數或重新設定每組人數')

  const boundary = getPendingPrelimGroupSizeError(6, 11)
  assert.ok(boundary.includes('自訂每組 6 人'), boundary)
  assert.ok(boundary.includes('目前 11 人'), boundary)

  const seven = getPendingPrelimGroupSizeError(7, 13)
  assert.ok(seven.includes('自訂每組 7 人'), seven)
  assert.ok(seven.includes('目前 13 人'), seven)
})

test('修正驗證：resolveCustomPrelimGroupSizeInput 合法回傳人數、不合法回傳範圍提示', () => {
  const rangeError = { size: null, error: '請輸入 3 至 12 的整數' }
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('', 24), rangeError)
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('2', 24), rangeError)
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('13', 24), rangeError)
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('6.5', 24), rangeError)
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('abc', 24), rangeError)
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('12', 24), { size: 12, error: '' })
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('6', 24), { size: 6, error: '' })
  // 照實作：5 人時上限 floor(5/2)=2 < 3，自訂輸入框連 '3' 也不接受（預設 3 由按鈕選擇）
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('3', 5), {
    size: null,
    error: '自訂每組人數至少需要 6 位參賽者',
  })
})

// ---- 2. 24 人輸入 6 ----

test('修正驗證：getPrelimPlan(24, 6) 為 4 組×6 人、60 場、淘汰賽 8 強', () => {
  const plan = getPrelimPlan(24, 6)
  assert.equal(plan.groupCount, 4)
  assert.deepEqual(plan.groupSizes, [6, 6, 6, 6])
  assert.equal(plan.matchCount, 60)
  assert.equal(plan.knockoutSize, 8)
})

test('修正驗證：24 人自訂 6，產生後實際分組與摘要一致；重新分組抽籤（random）後仍為 4 組×6 人', () => {
  const { api } = setupPrelim(24, 6)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, 6)

  assertFourGroupsOfSix(api)
  const reshuffled = assertFourGroupsOfSix(api, 'random')
  assert.equal(reshuffled.pairingMode, 'random')
  assert.equal(reshuffled.prelimCustomGroupSize, 6)
})

// ---- 3. 其他賽制不被擋 ----

test('修正驗證：自訂 6 後降到 10 人，free／single 仍可產生且與未自訂的對照組相同；切回 prelim 仍擋下', () => {
  const { api, stop } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  assertBlockedWithCustomSix(api, '10 人 prelim')

  // 對照組：同一份名單（含相同 id）、從未設定自訂值
  const control = deepRaw(api.brackets.value[api.currentId.value])
  delete control.prelimCustomGroupSize
  control.prelimGroupSize = 3

  const withCustom = {}
  for (const format of ['free', 'single']) {
    api.setFormat(format)
    assert.deepEqual(api.generateBracket(), { ok: true, errors: [] }, `${format} 不應被自訂值擋下`)
    const bracket = deepRaw(api.currentBracket.value)
    assert.equal(bracket.format, format)
    assert.equal(bracket.status, 'ready')
    assert.equal(bracket.prelim, null)
    assert.equal(bracket.prelimCustomGroupSize, 6, `${format} 產生後仍保留自訂值`)
    withCustom[format] = bracket
  }

  api.setFormat('prelim')
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, 6)
  assertBlockedWithCustomSix(api, '切回 prelim')
  stop()

  for (const format of ['free', 'single']) {
    const { api: controlApi, stop: stopControl } = mountWithStoredBracket(control)
    assert.equal(controlApi.currentBracket.value.prelimCustomGroupSize, null)
    controlApi.setFormat(format)
    assert.deepEqual(controlApi.generateBracket(), { ok: true, errors: [] })
    const expected = deepRaw(controlApi.currentBracket.value)
    assert.deepEqual(
      omitKeys(withCustom[format], ['updatedAt', 'prelimCustomGroupSize']),
      omitKeys(expected, ['updatedAt', 'prelimCustomGroupSize']),
      `${format} 結果應與對照組相同`,
    )
    stopControl()
  }
})

// ---- 4. 擋下時不改資料 ----

test('修正驗證：不合法狀態下 generateBracket 被擋，currentBracket 與 storage 完全不變', async () => {
  const { api } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  await flushStorage()

  const bracket = api.currentBracket.value
  // 照實作：人數不足時 prelimGroupSize 退回 3，自訂值另存於 prelimCustomGroupSize
  assert.equal(bracket.prelimGroupSize, 3)
  assert.equal(bracket.prelimCustomGroupSize, 6)
  const notice = getPendingPrelimGroupSizeError(bracket.prelimCustomGroupSize, bracket.players.length)
  // 有提示 → 設定頁摘要（firstRoundPreviewText）顯示提示，而不是用 prelimGroupSize=3 算出 3 組的摘要
  assert.ok(notice)

  const before = deepRaw(bracket)
  const storedBefore = storage.getItem(STORAGE_BRACKETS)
  const bracketsRefBefore = api.brackets.value

  const result = api.generateBracket()
  assert.equal(result.ok, false)
  assert.deepEqual(result.errors, [notice])

  await flushStorage()
  // 包含 updatedAt 在內完全相同：被擋下時沒有呼叫 persist
  assert.deepEqual(deepRaw(api.currentBracket.value), before)
  assert.equal(api.currentBracket.value.updatedAt, before.updatedAt)
  assert.equal(api.brackets.value, bracketsRefBefore)
  assert.equal(storage.getItem(STORAGE_BRACKETS), storedBefore)
})

// ---- 5. 人數降後再升恢復 ----

test('修正驗證：setPlayerCount 24→10→24，降人數期間保留自訂值並擋下，回到 24 人產生 4 組×6 人', () => {
  const { api } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  assertBlockedWithCustomSix(api, '10 人')
  api.setPlayerCount(24)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, 6)
  assertFourGroupsOfSix(api)
})

test('修正驗證：removePlayer 到 11 人再 addPlayer 回 24 人，過程中自訂值不遺失', () => {
  const { api } = setupPrelim(24, 6)
  while (api.currentBracket.value.players.length > 11) {
    api.removePlayer(api.currentBracket.value.players.at(-1).id)
    const { players, prelimCustomGroupSize, prelimGroupSize } = api.currentBracket.value
    assert.equal(prelimCustomGroupSize, 6, `${players.length} 人`)
    if (players.length >= 12) assert.equal(prelimGroupSize, 6, `${players.length} 人`)
  }
  assertBlockedWithCustomSix(api, '11 人')

  while (api.currentBracket.value.players.length < 24) {
    api.addPlayer()
    const count = api.currentBracket.value.players.length
    if (count < 12) {
      assertBlockedWithCustomSix(api, `${count} 人`)
    } else {
      assert.equal(api.currentBracket.value.prelimGroupSize, 6, `${count} 人`)
      assert.equal(api.currentBracket.value.prelimCustomGroupSize, 6, `${count} 人`)
    }
  }
  assertFourGroupsOfSix(api)
})

test('修正驗證：importPlayers 匯入 10 人再匯入 24 人，回到 24 人產生 4 組×6 人', () => {
  const { api } = setupPrelim(24, 6)
  api.importPlayers(playerNames(10))
  assert.equal(api.currentBracket.value.players.length, 10)
  assertBlockedWithCustomSix(api, '匯入 10 人')
  api.importPlayers(playerNames(24))
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  assertFourGroupsOfSix(api)
})

test('修正驗證：人數不足期間 updatePlayer 改名、renameBracket、調整種子與配對模式都不會清掉自訂值', () => {
  const { api } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  const target = api.currentBracket.value.players[0]

  api.updatePlayer(target.id, { name: '改名選手' })
  assert.equal(api.currentBracket.value.players[0].name, '改名選手')
  assertBlockedWithCustomSix(api, 'updatePlayer')

  assert.equal(api.renameBracket(api.currentId.value, '改名賽程'), true)
  assert.equal(api.currentBracket.value.name, '改名賽程')
  assertBlockedWithCustomSix(api, 'renameBracket')

  api.reorderPlayerSeeds()
  assertBlockedWithCustomSix(api, 'reorderPlayerSeeds')
  api.shufflePlayerSeeds()
  assertBlockedWithCustomSix(api, 'shufflePlayerSeeds')
  api.setPairingMode('random')
  assertBlockedWithCustomSix(api, 'setPairingMode')
  api.setPairingMode('order')

  api.setPlayerCount(24)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  const bracket = assertFourGroupsOfSix(api)
  assert.ok(bracket.players.some((player) => player.name === '改名選手'))
})

test('修正驗證：降到 10 人後重新載入 localStorage，自訂值仍在且擋下；再升回 24 人產生 4 組×6 人', async () => {
  const { api, stop } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  const id = api.currentId.value
  await flushStorage()

  const stored = readStoredBrackets()[id]
  assert.equal(stored.prelimCustomGroupSize, 6)
  assert.equal(stored.prelimGroupSize, 3)
  assert.equal(stored.players.length, 10)
  stop()

  const { api: reloaded } = mountBrackets()
  assert.equal(reloaded.currentId.value, id)
  assertBlockedWithCustomSix(reloaded, '重新載入後 10 人')
  reloaded.setPlayerCount(24)
  assert.equal(reloaded.currentBracket.value.prelimGroupSize, 6)
  assertFourGroupsOfSix(reloaded)
})

// ---- 6. 舊資料推回 ----

async function createLegacyBracket(playerCount, prelimGroupSize) {
  const { api, stop } = setupPrelim(playerCount)
  const id = api.currentId.value
  await flushStorage()
  const legacy = { ...readStoredBrackets()[id], prelimGroupSize }
  delete legacy.prelimCustomGroupSize
  stop()
  return legacy
}

const LEGACY_CASES = [
  { stored: 3, custom: null, size: 3 },
  { stored: 4, custom: null, size: 4 },
  { stored: 5, custom: null, size: 5 },
  { stored: 6, custom: 6, size: 6 },
  { stored: 2, custom: null, size: 3 },
  { stored: 'abc', custom: null, size: 3 },
]

for (const { stored, custom, size } of LEGACY_CASES) {
  test(`修正驗證：舊資料（無 prelimCustomGroupSize）prelimGroupSize=${JSON.stringify(stored)} 載入後自訂值為 ${custom}、每組 ${size}`, async () => {
    const legacy = await createLegacyBracket(24, stored)
    assert.equal('prelimCustomGroupSize' in legacy, false)
    const { api } = mountWithStoredBracket(legacy)
    assert.equal(api.currentBracket.value.prelimCustomGroupSize, custom)
    assert.equal(api.currentBracket.value.prelimGroupSize, size)
    if (size === 6) assertFourGroupsOfSix(api)
  })
}

test('修正驗證：[已知限制] 舊資料 prelimGroupSize 已被錯改成 3 時無法恢復自訂 6，升回 24 人仍為 8 組×3 人', async () => {
  // 舊版在人數不足時把 6 覆蓋成 3 並存檔，資料中已無原自訂值可推回
  const legacy = await createLegacyBracket(10, 3)
  const { api } = mountWithStoredBracket(legacy)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  assert.equal(api.currentBracket.value.prelimGroupSize, 3)
  api.setPlayerCount(24)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  assert.equal(api.currentBracket.value.prelimGroupSize, 3)
  assertPrelimGenerated(api, [3, 3, 3, 3, 3, 3, 3, 3])
})

// ---- 7. 3／4／5 與自訂互動 ----

test('修正驗證：自訂 6 → 選預設 4 清除自訂值；再自訂 7 則兩者皆為 7', () => {
  const { api } = setupPrelim(24, 6)
  api.setPrelimGroupSize(4)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  assert.equal(api.currentBracket.value.prelimGroupSize, 4)

  api.setPrelimGroupSize(7)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, 7)
  assert.equal(api.currentBracket.value.prelimGroupSize, 7)
  // round(24 / 7) = 3 組，平均分為 8／8／8
  assertPrelimGenerated(api, [8, 8, 8])
})

test('修正驗證：不合法狀態（自訂 6、10 人）選預設 5 可解除並產生 2 組×5 人', () => {
  const { api } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  assertBlockedWithCustomSix(api)

  // 不合法的自訂值本身無法再次套用
  api.setPrelimGroupSize(6)
  assertBlockedWithCustomSix(api, '再設 6')

  api.setPrelimGroupSize(5)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  assert.equal(api.currentBracket.value.prelimGroupSize, 5)
  assert.equal(getPendingPrelimGroupSizeError(null, 10), '')
  assertPrelimGenerated(api, [5, 5])
})

test('修正驗證：不合法狀態（自訂 6、10 人）選預設 3 也可解除', () => {
  const { api } = setupPrelim(24, 6)
  api.setPlayerCount(10)
  assertBlockedWithCustomSix(api)

  api.setPrelimGroupSize(3)
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  assert.equal(api.currentBracket.value.prelimGroupSize, 3)
  assertPrelimGenerated(api, [4, 3, 3])
})

// ---- 8. 原本 3／4／5 行為不變 ----

test('修正驗證：未自訂時 prelimCustomGroupSize 為 null', () => {
  const { api } = mountBrackets()
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  api.setPlayerCount(24)
  api.setFormat('prelim')
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, null)
  assert.equal(api.currentBracket.value.prelimGroupSize, 3)
})

test('修正驗證：6 人選 5 產生 1 組 6 人、8 人選 5 產生 2 組×4 人，自訂值為 null', () => {
  for (const [count, expected] of [
    [6, [6]],
    [8, [4, 4]],
  ]) {
    const { api, stop } = setupPrelim(count, 5)
    assert.equal(api.currentBracket.value.prelimGroupSize, 5, `${count} 人`)
    assert.equal(api.currentBracket.value.prelimCustomGroupSize, null, `${count} 人`)
    const bracket = assertPrelimGenerated(api, expected)
    assert.equal(bracket.prelim.groupSize, 5)
    stop()
    storage.clear()
  }
})

test('修正驗證：24 人從未自訂、直接選 3／4／5 的分組不變', () => {
  const expected = { 3: [3, 3, 3, 3, 3, 3, 3, 3], 4: [4, 4, 4, 4, 4, 4], 5: [5, 5, 5, 5, 4] }
  for (const size of [3, 4, 5]) {
    const { api, stop } = setupPrelim(24, size)
    assert.equal(api.currentBracket.value.prelimCustomGroupSize, null, `每組約 ${size} 人`)
    assert.equal(api.currentBracket.value.prelimGroupSize, size)
    const bracket = assertPrelimGenerated(api, expected[size])
    assert.equal(bracket.prelim.groupSize, size)
    stop()
    storage.clear()
  }
})
