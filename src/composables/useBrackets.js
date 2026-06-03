import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import {
  buildInitialPlayers,
  createId,
  createSlots,
  sanitizeResults,
  validatePlayers,
} from './useBracketEngine'

const STORAGE_BRACKETS = 'battletree:brackets'
const STORAGE_CURRENT_ID = 'battletree:currentId'

function createLotteryState() {
  return {
    poolFilter: 'all',
    confirmed: false,
    pool: [],
    drawn: [],
  }
}

function createBracket(overrides = {}) {
  const now = Date.now()
  return {
    version: 1,
    id: createId('bracket'),
    name: '新對戰表',
    createdAt: now,
    updatedAt: now,
    status: 'setup',
    players: buildInitialPlayers(8),
    pairingMode: 'order',
    bracketSize: 8,
    slots: [],
    results: {},
    lottery: createLotteryState(),
    ...overrides,
  }
}

function normalizeBracket(bracket) {
  const fallback = createBracket()
  const normalized = {
    ...fallback,
    ...bracket,
    version: 1,
    players: Array.isArray(bracket?.players) && bracket.players.length ? bracket.players : fallback.players,
    slots: Array.isArray(bracket?.slots) ? bracket.slots : [],
    results: bracket?.results && typeof bracket.results === 'object' ? bracket.results : {},
    lottery: {
      ...createLotteryState(),
      ...(bracket?.lottery ?? {}),
    },
  }
  normalized.bracketSize = normalized.slots.length || normalized.bracketSize || normalized.players.length
  return normalized
}

export function useBrackets() {
  const brackets = useStorage(STORAGE_BRACKETS, {}, localStorage, {
    mergeDefaults: true,
  })
  const currentId = useStorage(STORAGE_CURRENT_ID, null)

  function ensureInitialBracket() {
    const ids = Object.keys(brackets.value)
    if (ids.length && currentId.value && brackets.value[currentId.value]) return
    if (ids.length) {
      currentId.value = ids[0]
      return
    }
    const bracket = createBracket()
    brackets.value = { [bracket.id]: bracket }
    currentId.value = bracket.id
  }

  function normalizeAll() {
    const normalized = {}
    Object.values(brackets.value ?? {}).forEach((bracket) => {
      const next = normalizeBracket(bracket)
      normalized[next.id] = next
    })
    brackets.value = normalized
    ensureInitialBracket()
  }

  normalizeAll()

  const bracketList = computed(() =>
    Object.values(brackets.value)
      .map(normalizeBracket)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  )

  const currentBracket = computed(() => {
    if (!currentId.value) return null
    return brackets.value[currentId.value] ? normalizeBracket(brackets.value[currentId.value]) : null
  })

  function persist(bracket) {
    brackets.value = {
      ...brackets.value,
      [bracket.id]: {
        ...normalizeBracket(bracket),
        updatedAt: Date.now(),
      },
    }
  }

  function updateCurrent(updater) {
    const bracket = currentBracket.value
    if (!bracket) return
    const next = typeof updater === 'function' ? updater({ ...bracket }) : { ...bracket, ...updater }
    persist(next)
  }

  function addBracket() {
    const bracket = createBracket()
    brackets.value = { ...brackets.value, [bracket.id]: bracket }
    currentId.value = bracket.id
  }

  function selectBracket(id) {
    if (brackets.value[id]) currentId.value = id
  }

  function deleteBracket(id = currentId.value) {
    if (!id || !brackets.value[id]) return
    const next = { ...brackets.value }
    delete next[id]
    brackets.value = next

    const ids = Object.keys(next)
    if (!ids.length) {
      addBracket()
      return
    }
    if (currentId.value === id) currentId.value = ids[0]
  }

  function setPlayerCount(count) {
    const safeCount = Math.max(2, Math.min(64, Number(count) || 2))
    updateCurrent((bracket) => {
      const existing = bracket.players ?? []
      const players = Array.from({ length: safeCount }, (_, index) => {
        const old = existing[index]
        return old
          ? { ...old, seed: Number(old.seed) || index + 1 }
          : { id: createId('player'), name: `Player${index + 1}`, seed: index + 1 }
      })
      return {
        ...bracket,
        status: 'setup',
        players,
        slots: [],
        results: {},
        lottery: createLotteryState(),
      }
    })
  }

  function updatePlayer(playerId, patch) {
    updateCurrent((bracket) => ({
      ...bracket,
      players: bracket.players.map((player) => (player.id === playerId ? { ...player, ...patch } : player)),
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
    }))
  }

  function setPairingMode(pairingMode) {
    updateCurrent((bracket) => ({
      ...bracket,
      pairingMode,
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
    }))
  }

  function generateBracket(forceMode) {
    const bracket = currentBracket.value
    if (!bracket) return { ok: false, errors: ['找不到目前對戰表'] }
    const errors = validatePlayers(bracket.players)
    if (errors.length) return { ok: false, errors }

    const pairingMode = forceMode ?? bracket.pairingMode
    const { bracketSize, slots } = createSlots(bracket.players, pairingMode)
    persist({
      ...bracket,
      pairingMode,
      bracketSize,
      slots,
      status: 'ready',
      results: {},
      lottery: createLotteryState(),
    })
    return { ok: true, errors: [] }
  }

  function setResult(matchId, winnerSlot, scores = {}) {
    updateCurrent((bracket) => {
      const current = bracket.results?.[matchId]
      const changedRound = Number(/^r(\d+)-m\d+$/.exec(matchId)?.[1] ?? 0)
      const nextResults = Object.fromEntries(
        Object.entries(bracket.results ?? {}).filter(([id]) => {
          const round = Number(/^r(\d+)-m\d+$/.exec(id)?.[1] ?? 0)
          return round <= changedRound
        }),
      )
      if (current?.winnerSlot === winnerSlot) {
        delete nextResults[matchId]
      } else {
        nextResults[matchId] = {
          winnerSlot,
          scoreA: scores.scoreA ?? current?.scoreA ?? null,
          scoreB: scores.scoreB ?? current?.scoreB ?? null,
        }
      }
      const nextBracket = { ...bracket, results: nextResults }
      return { ...nextBracket, results: sanitizeResults(nextBracket) }
    })
  }

  function updateScore(matchId, scoreA, scoreB) {
    updateCurrent((bracket) => {
      const current = bracket.results?.[matchId]
      if (!current) return bracket
      return {
        ...bracket,
        results: {
          ...bracket.results,
          [matchId]: {
            ...current,
            scoreA,
            scoreB,
          },
        },
      }
    })
  }

  function updateLottery(lottery) {
    updateCurrent((bracket) => ({
      ...bracket,
      lottery: {
        ...bracket.lottery,
        ...lottery,
      },
    }))
  }

  return {
    brackets,
    bracketList,
    currentId,
    currentBracket,
    addBracket,
    selectBracket,
    deleteBracket,
    updateCurrent,
    setPlayerCount,
    updatePlayer,
    setPairingMode,
    generateBracket,
    setResult,
    updateScore,
    updateLottery,
  }
}
