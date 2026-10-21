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
// 因此 useStorage 只會對「明確傳入 localStorage」的 brackets 做持久化。
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

const { effectScope } = await import('vue')
const { useBrackets } = await import('../src/composables/useBrackets.js')
// 以 destructuring 取用：不存在的匯出只會是 undefined，不會讓整個檔案載入失敗
const { getAutoAppliedPrelimGroupSizeNotice, getPendingPrelimGroupSizeError, resolveCustomPrelimGroupSizeInput } =
  await import('../src/composables/usePrelimEngine.js')

const scopes = []

function mountBrackets() {
  const scope = effectScope()
  const api = scope.run(() => useBrackets())
  scopes.push(scope)
  return { api, stop: () => scope.stop() }
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

// 情境 1：24 人自訂 6 → 降到 10 人（自訂 6 待生效）
function setupPendingCustomSix() {
  const { api, stop } = setupPrelim(24, 6)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)
  api.setPlayerCount(10)
  return { api, stop }
}

// 複製 src/components/BracketSetup.vue 監看 props.bracket.players.length 的 watch 邏輯（commit 414bcb8b 時的版本）。
// 元件無法在 node --test 掛載，因此在這裡照抄：customPrelimGroupSizeError 為空就直接 return（notice 為 ''），
// 否則重新判斷輸入框的值，並以 wasBlocked: true 呼叫 getAutoAppliedPrelimGroupSizeNotice。
// 元件的 watch 若修改，這個 helper 也必須同步更新。
function simulateCurrentWatch({ customInputError, inputValue, previousCount, count }) {
  // 對應元件：prelimGroupSizeNotice.value = ''
  let notice = ''
  // 對應元件：if (!customPrelimGroupSizeError.value) return
  if (!customInputError) return { notice, customInputError, emittedSize: null }
  const { size, error } = resolveCustomPrelimGroupSizeInput(inputValue, count)
  notice = getAutoAppliedPrelimGroupSizeNotice({
    value: inputValue,
    wasBlocked: true,
    previousPlayerCount: previousCount,
    playerCount: count,
  })
  return { notice, customInputError: error, emittedSize: size }
}

// 元件中輸入框的值：customPrelimGroupSize = String(prelimCustomGroupSize ?? prelimGroupSize)
function inputValueOf(bracket) {
  return String(bracket.prelimCustomGroupSize ?? bracket.prelimGroupSize)
}

// ---- 整合：待生效的自訂值因人數增加自動生效 ----

test('自動套用複驗：24 人自訂 6，降到 10 人待生效並擋下產生，加回 12 人自動生效並產生 2 組×6', () => {
  const { api } = setupPendingCustomSix()

  const pending = api.currentBracket.value
  assert.equal(pending.players.length, 10)
  assert.equal(pending.prelimCustomGroupSize, 6)
  const pendingError = getPendingPrelimGroupSizeError(6, 10)
  assert.ok(pendingError)

  const blocked = api.generateBracket()
  assert.equal(blocked.ok, false)
  assert.deepEqual(blocked.errors, [pendingError])
  assert.equal(api.currentBracket.value.status, 'setup')
  assert.equal(api.currentBracket.value.prelim, null)

  api.setPlayerCount(12)
  const applied = api.currentBracket.value
  assert.equal(applied.players.length, 12)
  assert.equal(applied.prelimCustomGroupSize, 6)
  assert.equal(applied.prelimGroupSize, 6)
  assert.equal(getPendingPrelimGroupSizeError(6, 12), '')

  assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
  assert.equal(api.currentBracket.value.status, 'prelim')
  assert.deepEqual(api.currentBracket.value.prelim.groups.map((group) => group.playerIds.length), [6, 6])
})

// ---- 元件 watch：目前行為與已知缺口 ----

test('自動套用複驗：[記錄目前行為／已知缺口] 待生效的自訂 6 在 10→12 人自動生效時，watch 不顯示提示', () => {
  const { api } = setupPendingCustomSix()
  const inputValue = inputValueOf(api.currentBracket.value)
  assert.equal(inputValue, '6')
  // 待生效提示來自 pendingPrelimGroupSizeError（computed），輸入框本身沒有 customPrelimGroupSizeError
  const customInputError = ''

  api.setPlayerCount(12)
  assert.equal(api.currentBracket.value.prelimGroupSize, 6)

  const result = simulateCurrentWatch({ customInputError, inputValue, previousCount: 10, count: 12 })
  // 已知缺口：自訂 6 在 10 人時被擋下（畫面有提示、無法產生），人數加回 12 後由 normalizeBracket 自動生效，
  // 但 watch 只看 customPrelimGroupSizeError，此時為空就直接 return，沒有「已套用」提示。
  // 這違反「被擋下的值自動生效要顯示提示」。修正 src 後此測試應改寫為期望有提示。
  assert.equal(result.notice, '')
  assert.equal(result.emittedSize, null)
})

test(
  '自動套用複驗：[期望行為] 待生效的自訂 6 在 10→12 人自動生效時，watch 應顯示「已套用」提示',
  { todo: 'src 尚未修：watch 的 wasBlocked 需同時涵蓋 getPendingPrelimGroupSizeError(prelimCustomGroupSize, previousCount) 非空的情況' },
  () => {
    const { api } = setupPendingCustomSix()
    const inputValue = inputValueOf(api.currentBracket.value)
    api.setPlayerCount(12)

    // simulateCurrentWatch 是目前元件邏輯的複製；src 修正後需同步更新 helper，此 todo 才會通過並可移除 todo 標記
    const result = simulateCurrentWatch({ customInputError: '', inputValue, previousCount: 10, count: 12 })
    assert.equal(result.notice, '人數已達 12 人，自訂每組 6 人已套用')
  },
)

test('自動套用複驗：以 getPendingPrelimGroupSizeError(prelimCustomGroupSize, previousCount) 判定被擋下時，純函式回傳已套用提示', () => {
  const { api } = setupPendingCustomSix()
  const before = api.currentBracket.value
  const previousCount = before.players.length
  // 期望修正：wasBlocked 也要包含「已存的自訂值在舊人數下待生效」的情況
  const wasBlocked = Boolean(getPendingPrelimGroupSizeError(before.prelimCustomGroupSize, previousCount))
  assert.equal(wasBlocked, true)

  api.setPlayerCount(12)
  const count = api.currentBracket.value.players.length
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked, previousPlayerCount: previousCount, playerCount: count }),
    '人數已達 12 人，自訂每組 6 人已套用',
  )
})

test('自動套用複驗：純函式 wasBlocked=true、10→12 人時回傳已套用提示', () => {
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked: true, previousPlayerCount: 10, playerCount: 12 }),
    '人數已達 12 人，自訂每組 6 人已套用',
  )
})

// ---- 純函式邊界 ----

test('自動套用複驗：純函式人數未變動（previousPlayerCount === playerCount）回傳空字串', () => {
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked: true, previousPlayerCount: 12, playerCount: 12 }),
    '',
  )
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked: true, previousPlayerCount: 10, playerCount: 10 }),
    '',
  )
})

test('自動套用複驗：純函式 10→11 人（6 仍不合法）回傳空字串', () => {
  assert.equal(resolveCustomPrelimGroupSizeInput('6', 11).size, null)
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked: true, previousPlayerCount: 10, playerCount: 11 }),
    '',
  )
})

test('自動套用複驗：純函式 10→12 人（6 合法）回傳已套用提示', () => {
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('6', 12), { size: 6, error: '' })
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked: true, previousPlayerCount: 10, playerCount: 12 }),
    '人數已達 12 人，自訂每組 6 人已套用',
  )
})

test('自動套用複驗：純函式人數減少但仍合法（30→14、輸入 6）照實作仍回傳提示', () => {
  // 實作只判斷「人數有變動且新人數下合法」，不區分增減；文案沿用「人數已達」
  assert.deepEqual(resolveCustomPrelimGroupSizeInput('6', 14), { size: 6, error: '' })
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: '6', wasBlocked: true, previousPlayerCount: 30, playerCount: 14 }),
    '人數已達 14 人，自訂每組 6 人已套用',
  )
})

test('自動套用複驗：純函式 value 為 number 6（非字串）照實作回傳提示', () => {
  // resolveCustomPrelimGroupSizeInput 只排除 ''，number 6 經 Number() 驗證後合法
  assert.deepEqual(resolveCustomPrelimGroupSizeInput(6, 12), { size: 6, error: '' })
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: 6, wasBlocked: true, previousPlayerCount: 10, playerCount: 12 }),
    '人數已達 12 人，自訂每組 6 人已套用',
  )
  assert.equal(
    getAutoAppliedPrelimGroupSizeNotice({ value: 6, wasBlocked: true, previousPlayerCount: 10, playerCount: 11 }),
    '',
  )
})

// ---- 其他賽制不受待生效狀態影響 ----

test('自動套用複驗：待生效（自訂 6、10 人）時切到自由編排（free）仍可產生', () => {
  const { api } = setupPendingCustomSix()
  assert.ok(getPendingPrelimGroupSizeError(api.currentBracket.value.prelimCustomGroupSize, 10))

  api.setFormat('free')
  assert.equal(api.currentBracket.value.format, 'free')
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, 6)
  assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
})

test('自動套用複驗：待生效（自訂 6、10 人）時切到單淘汰（single）仍可產生', () => {
  const { api } = setupPendingCustomSix()
  assert.ok(getPendingPrelimGroupSizeError(api.currentBracket.value.prelimCustomGroupSize, 10))

  api.setFormat('single')
  assert.equal(api.currentBracket.value.format, 'single')
  assert.equal(api.currentBracket.value.prelimCustomGroupSize, 6)
  assert.deepEqual(api.generateBracket(), { ok: true, errors: [] })
})
