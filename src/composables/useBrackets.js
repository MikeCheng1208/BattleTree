import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { DEFAULT_BRACKET_FORMAT } from '../constants/bracketOptions'
import {
  buildInitialPlayers,
  createFreeSlots,
  createGroupedSlots,
  createId,
  deriveRounds,
  FREE_SLOT_COUNT_OPTIONS,
  getFirstRoundState,
  getGroupLabel,
  normalizeFreeSlotCount,
  sanitizeResults,
  shufflePlayers,
  THIRD_PLACE_MATCH_ID,
  validatePlayers,
} from './useBracketEngine'
import {
  createPrelimGroups,
  createPrelimKnockoutSlots,
  getPrelimQualification,
  normalizePrelimGroupSize,
} from './usePrelimEngine'

const STORAGE_BRACKETS = 'battletree:brackets'
const STORAGE_CURRENT_ID = 'battletree:currentId'
const STORAGE_OPEN_TABS = 'battletree:openTabs'
const DEFAULT_PLAYER_COUNT = 4
const BRACKET_FORMATS = new Set(['free', 'single', 'prelim'])
const GROUP_COUNT_OPTIONS = [1, 2, 4, 8]

function normalizeFormat(format) {
  return BRACKET_FORMATS.has(format) ? format : DEFAULT_BRACKET_FORMAT
}

function normalizeGroupCount(count, playerCount = Infinity) {
  const requested = Number(count) || 1
  const maxGroups = Math.max(1, Math.floor(playerCount / 2))
  return [...GROUP_COUNT_OPTIONS].reverse().find((option) => option <= requested && option <= maxGroups) ?? 1
}

function createLotteryState() {
  return {
    poolFilter: 'all',
    confirmed: false,
    excludedIds: [],
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
    players: buildInitialPlayers(DEFAULT_PLAYER_COUNT),
    pairingMode: 'order',
    format: DEFAULT_BRACKET_FORMAT,
    prelimGroupSize: 3,
    prelim: null,
    freeSlotCount: 8,
    byeSlots: [],
    refillSlots: [],
    groupCount: 1,
    bracketSize: DEFAULT_PLAYER_COUNT,
    slots: [],
    results: {},
    lottery: createLotteryState(),
    ...overrides,
  }
}

function normalizeBracket(bracket) {
  const fallback = createBracket()
  const players =
    Array.isArray(bracket?.players) && bracket.players.length
      ? bracket.players.map((player, index) => {
          const name = typeof player.name === 'string' ? player.name : `Player${index + 1}`
          const title = typeof player.title === 'string' ? player.title : ''
          return {
            id: player.id || createId('player'),
            name,
            title,
            displayName: title.trim() || name,
            seed: Number(player.seed) || index + 1,
            registrationConfirmed: Boolean(player.registrationConfirmed),
          }
        })
      : fallback.players
  const normalized = {
    ...fallback,
    ...bracket,
    version: 1,
    players,
    slots: Array.isArray(bracket?.slots) ? bracket.slots : [],
    results: bracket?.results && typeof bracket.results === 'object' ? bracket.results : {},
    lottery: {
      ...createLotteryState(),
      ...(bracket?.lottery ?? {}),
    },
  }
  normalized.bracketSize = normalized.slots.length || normalized.bracketSize || normalized.players.length
  normalized.groupCount = normalizeGroupCount(normalized.groupCount, normalized.players.length)
  normalized.format = normalizeFormat(bracket?.format)
  normalized.prelimGroupSize = normalizePrelimGroupSize(bracket?.prelimGroupSize)
  normalized.prelim =
    bracket?.prelim && Array.isArray(bracket.prelim.groups) && bracket.prelim.groups.length
      ? {
          groupSize: normalizePrelimGroupSize(bracket.prelim.groupSize),
          groups: bracket.prelim.groups.map((group, index) => ({
            label: group?.label || getGroupLabel(index),
            playerIds: Array.isArray(group?.playerIds) ? group.playerIds : [],
          })),
          results:
            bracket.prelim.results && typeof bracket.prelim.results === 'object' ? bracket.prelim.results : {},
        }
      : null
  if (normalized.status === 'prelim' && (normalized.format !== 'prelim' || !normalized.prelim)) {
    normalized.status = 'setup'
  }
  normalized.freeSlotCount = normalizeFreeSlotCount(bracket?.freeSlotCount, normalized.players.length)
  const cleanSlotIndexes = (list) =>
    normalized.format === 'free' && Array.isArray(list)
      ? [
          ...new Set(
            list
              .map(Number)
              .filter((index) => Number.isInteger(index) && index >= 0 && index < normalized.slots.length),
          ),
        ]
      : []
  normalized.byeSlots = cleanSlotIndexes(bracket?.byeSlots)
  normalized.refillSlots = cleanSlotIndexes(bracket?.refillSlots)
  if (normalized.format === 'free') normalized.groupCount = 1
  delete normalized.repechage
  return normalized
}

// 自由編排：改判第一輪結果後，檢查被填入空格的敗者是否仍具敗者身分，否則清回待定
function releaseInvalidRefills(bracket) {
  const refillSlots = bracket.refillSlots ?? []
  if (bracket.format !== 'free' || !refillSlots.length) return bracket

  const firstRound = deriveRounds(bracket)[0] ?? []
  const slots = [...bracket.slots]
  const keptRefills = []
  let changed = false

  refillSlots.forEach((index) => {
    const playerId = slots[index]
    if (!playerId) {
      changed = true
      return
    }
    const otherIndexes = slots
      .map((id, slotIndex) => (id === playerId && slotIndex !== index ? slotIndex : -1))
      .filter((slotIndex) => slotIndex >= 0)
    if (!otherIndexes.length) {
      keptRefills.push(index)
      return
    }
    const stillLoser = otherIndexes.some((slotIndex) => {
      const match = firstRound[Math.floor(slotIndex / 2)]
      return match?.isPlayable && match.winnerId && match.winnerId !== playerId
    })
    if (stillLoser) {
      keptRefills.push(index)
    } else {
      slots[index] = null
      changed = true
    }
  })

  if (!changed) return { ...bracket, refillSlots: keptRefills }
  return { ...bracket, slots, refillSlots: keptRefills }
}

export function useBrackets() {
  const brackets = useStorage(STORAGE_BRACKETS, {}, localStorage, {
    mergeDefaults: true,
  })
  const currentId = useStorage(STORAGE_CURRENT_ID, null)
  const hadOpenTabsStorage = localStorage.getItem(STORAGE_OPEN_TABS) !== null
  const openTabIds = useStorage(STORAGE_OPEN_TABS, [])

  function ensureInitialBracket() {
    const ids = Object.keys(brackets.value)
    if (ids.length) return
    const bracket = createBracket()
    brackets.value = { [bracket.id]: bracket }
  }

  function normalizeOpenTabs() {
    const bracketIds = Object.keys(brackets.value)
    const validIds = new Set(bracketIds)
    const sourceIds = hadOpenTabsStorage
      ? openTabIds.value
      : [currentId.value && validIds.has(currentId.value) ? currentId.value : bracketIds[0]].filter(Boolean)
    openTabIds.value = [...new Set(Array.isArray(sourceIds) ? sourceIds : [])].filter((id) => validIds.has(id))
    if (!openTabIds.value.includes(currentId.value)) {
      currentId.value = openTabIds.value[0] ?? null
    }
  }

  function normalizeAll() {
    const normalized = {}
    Object.values(brackets.value ?? {}).forEach((bracket) => {
      const next = normalizeBracket(bracket)
      normalized[next.id] = next
    })
    brackets.value = normalized
    ensureInitialBracket()
    normalizeOpenTabs()
  }

  normalizeAll()

  const bracketList = computed(() =>
    Object.values(brackets.value)
      .map(normalizeBracket)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  )

  const openBrackets = computed(() =>
    openTabIds.value
      .map((id) => brackets.value[id])
      .filter(Boolean)
      .map(normalizeBracket),
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

  function renameBracket(id, name) {
    const bracket = brackets.value[id]
    const nextName = typeof name === 'string' ? name.trim() : ''
    if (!bracket || !nextName) return false
    persist({ ...normalizeBracket(bracket), name: nextName })
    return true
  }

  function getUniqueBracketName() {
    const names = new Set(Object.values(brackets.value).map((bracket) => bracket.name))
    if (!names.has('新對戰表')) return '新對戰表'
    let suffix = 2
    while (names.has(`新對戰表 ${suffix}`)) suffix += 1
    return `新對戰表 ${suffix}`
  }

  function addBracket(
    {
      name = '',
      format = DEFAULT_BRACKET_FORMAT,
      rosterSource = 'blank',
      sourceBracketId = currentId.value,
    } = {},
  ) {
    const sourceBracket = rosterSource === 'current' ? brackets.value[sourceBracketId] : null
    const copiedPlayers = sourceBracket
      ? normalizeBracket(sourceBracket).players.map((player) => ({
          id: createId('player'),
          name: player.name,
          title: player.title,
          seed: player.seed,
          registrationConfirmed: player.registrationConfirmed,
        }))
      : null
    const bracket = createBracket({
      name: typeof name === 'string' && name.trim() ? name.trim() : getUniqueBracketName(),
      format: normalizeFormat(format),
      ...(copiedPlayers ? { players: copiedPlayers } : {}),
    })
    brackets.value = { ...brackets.value, [bracket.id]: bracket }
    openTabIds.value = [...openTabIds.value.filter((id) => id !== bracket.id), bracket.id]
    currentId.value = bracket.id
    return bracket.id
  }

  function openBracketTab(id) {
    if (!brackets.value[id]) return false
    if (!openTabIds.value.includes(id)) openTabIds.value = [...openTabIds.value, id]
    currentId.value = id
    return true
  }

  function closeBracketTab(id) {
    const index = openTabIds.value.indexOf(id)
    if (index === -1) return currentId.value
    const nextOpenIds = openTabIds.value.filter((tabId) => tabId !== id)
    openTabIds.value = nextOpenIds
    if (currentId.value === id) {
      currentId.value = nextOpenIds[index] ?? nextOpenIds[index - 1] ?? null
    }
    return currentId.value
  }

  function deleteBracket(id = currentId.value) {
    if (!id || !brackets.value[id]) return
    const deletedTabIndex = openTabIds.value.indexOf(id)
    const next = { ...brackets.value }
    delete next[id]
    brackets.value = next
    const nextOpenIds = openTabIds.value.filter((tabId) => tabId !== id)
    openTabIds.value = nextOpenIds

    const ids = Object.keys(next)
    if (!ids.length) {
      addBracket()
      return
    }
    if (currentId.value === id) {
      currentId.value =
        nextOpenIds[deletedTabIndex] ?? nextOpenIds[deletedTabIndex - 1] ?? nextOpenIds[0] ?? null
    }
  }

  function resetCurrentBracket() {
    const bracket = currentBracket.value
    if (!bracket) return
    persist(createBracket({ id: bracket.id, createdAt: bracket.createdAt }))
  }

  function setPlayerCount(count) {
    const safeCount = Math.max(2, Number(count) || 2)
    updateCurrent((bracket) => {
      const existing = bracket.players ?? []
      const players = Array.from({ length: safeCount }, (_, index) => {
        const old = existing[index]
        return old
          ? {
              ...old,
              seed: Number(old.seed) || index + 1,
              registrationConfirmed: Boolean(old.registrationConfirmed),
            }
          : {
              id: createId('player'),
              name: `Player${index + 1}`,
              title: '',
              seed: index + 1,
              registrationConfirmed: false,
            }
      })
      return {
        ...bracket,
        status: 'setup',
        players,
        groupCount: normalizeGroupCount(bracket.groupCount, players.length),
        slots: [],
        results: {},
        byeSlots: [],
        refillSlots: [],
        lottery: createLotteryState(),
      }
    })
  }

  function addPlayer() {
    updateCurrent((bracket) => {
      const players = [
        ...(bracket.players ?? []),
        {
          id: createId('player'),
          name: `Player${(bracket.players?.length ?? 0) + 1}`,
          title: '',
          seed: Math.max(0, ...(bracket.players ?? []).map((player) => Number(player.seed) || 0)) + 1,
          registrationConfirmed: false,
        },
      ]

      return {
        ...bracket,
        status: 'setup',
        players,
        groupCount: normalizeGroupCount(bracket.groupCount, players.length),
        slots: [],
        results: {},
        byeSlots: [],
        refillSlots: [],
        lottery: createLotteryState(),
      }
    })
  }

  function importPlayers(entries) {
    const importedEntries = entries
      .map((entry) =>
        typeof entry === 'string'
          ? { name: entry.trim(), title: '' }
          : { name: (entry?.name ?? '').trim(), title: (entry?.title ?? '').trim() },
      )
      .filter((entry) => entry.name)
    if (importedEntries.length < 2) return

    updateCurrent((bracket) => {
      const players = importedEntries.map((entry, index) => ({
        id: createId('player'),
        name: entry.name,
        title: entry.title,
        seed: index + 1,
        registrationConfirmed: false,
      }))

      return {
        ...bracket,
        status: 'setup',
        players,
        groupCount: normalizeGroupCount(bracket.groupCount, players.length),
        slots: [],
        results: {},
        byeSlots: [],
        refillSlots: [],
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
      byeSlots: bracket.status === 'ready' ? [] : bracket.byeSlots,
      refillSlots: bracket.status === 'ready' ? [] : bracket.refillSlots,
    }))
  }

  function removePlayer(playerId) {
    updateCurrent((bracket) => {
      if ((bracket.players?.length ?? 0) <= 2) return bracket
      const players = bracket.players.filter((player) => player.id !== playerId)
      return {
        ...bracket,
        status: 'setup',
        players,
        groupCount: normalizeGroupCount(bracket.groupCount, players.length),
        slots: [],
        results: {},
        byeSlots: [],
        refillSlots: [],
        lottery: createLotteryState(),
      }
    })
  }

  function reorderPlayerSeeds() {
    updateCurrent((bracket) => ({
      ...bracket,
      status: 'setup',
      players: bracket.players.map((player, index) => ({
        ...player,
        seed: index + 1,
      })),
      slots: [],
      results: {},
      byeSlots: [],
      refillSlots: [],
      lottery: createLotteryState(),
    }))
  }

  function shufflePlayerSeeds() {
    updateCurrent((bracket) => {
      const players = shufflePlayers(bracket.players ?? []).map((player, index) => ({
        ...player,
        seed: index + 1,
      }))

      return {
        ...bracket,
        status: 'setup',
        players,
        slots: [],
        results: {},
        byeSlots: [],
        refillSlots: [],
        lottery: createLotteryState(),
      }
    })
  }

  function setPairingMode(pairingMode) {
    updateCurrent((bracket) => ({
      ...bracket,
      pairingMode,
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
      byeSlots: bracket.status === 'ready' ? [] : bracket.byeSlots,
      refillSlots: bracket.status === 'ready' ? [] : bracket.refillSlots,
    }))
  }

  function setGroupCount(groupCount) {
    updateCurrent((bracket) => ({
      ...bracket,
      groupCount: normalizeGroupCount(groupCount, bracket.players.length),
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
    }))
  }

  function setFormat(format) {
    const normalizedFormat = normalizeFormat(format)
    updateCurrent((bracket) => ({
      ...bracket,
      format: normalizedFormat,
      status: 'setup',
      slots: [],
      results: {},
      prelim: null,
      byeSlots: [],
      refillSlots: [],
      groupCount: normalizedFormat === 'free' ? 1 : bracket.groupCount,
      lottery: createLotteryState(),
    }))
  }

  function setPrelimGroupSize(groupSize) {
    updateCurrent((bracket) => ({
      ...bracket,
      prelimGroupSize: normalizePrelimGroupSize(groupSize),
      status: 'setup',
      slots: [],
      results: {},
      prelim: null,
      lottery: createLotteryState(),
    }))
  }

  function setFreeSlotCount(count) {
    const bracket = currentBracket.value
    if (!bracket) return { ok: false, errors: ['找不到目前對戰表'] }
    const requested = Number(count)
    if (!FREE_SLOT_COUNT_OPTIONS.includes(requested)) {
      return { ok: false, errors: ['對戰格數僅支援 8／16／32／64'] }
    }
    if (bracket.players.length > requested) {
      return {
        ok: false,
        errors: [`參賽人數 ${bracket.players.length} 人超過 ${requested} 格，請選更大的格數或減少人數`],
      }
    }
    updateCurrent((current) => ({
      ...current,
      freeSlotCount: requested,
      status: 'setup',
      slots: [],
      results: {},
      byeSlots: [],
      refillSlots: [],
      lottery: createLotteryState(),
    }))
    return { ok: true, errors: [] }
  }

  function generateBracket(forceMode) {
    const bracket = currentBracket.value
    if (!bracket) return { ok: false, errors: ['找不到目前對戰表'] }
    const errors = validatePlayers(bracket.players)
    if (errors.length) return { ok: false, errors }

    const pairingMode = forceMode ?? bracket.pairingMode

    if (bracket.format === 'prelim') {
      if (bracket.players.length < 3) return { ok: false, errors: ['預賽模式至少需要 3 位參賽者'] }
      const groups = createPrelimGroups(bracket.players, bracket.prelimGroupSize, pairingMode)
      persist({
        ...bracket,
        pairingMode,
        status: 'prelim',
        slots: [],
        results: {},
        prelim: { groupSize: normalizePrelimGroupSize(bracket.prelimGroupSize), groups, results: {} },
        byeSlots: [],
        refillSlots: [],
        lottery: createLotteryState(),
      })
      return { ok: true, errors: [] }
    }

    if (bracket.format === 'free') {
      if (bracket.players.length > 64) {
        return { ok: false, errors: ['自由編排最多 64 格，請減少參賽人數'] }
      }
      const slotCount = normalizeFreeSlotCount(bracket.freeSlotCount, bracket.players.length)
      const { slots } = createFreeSlots(bracket.players, pairingMode, slotCount)
      persist({
        ...bracket,
        pairingMode,
        groupCount: 1,
        freeSlotCount: slotCount,
        bracketSize: slotCount,
        slots,
        byeSlots: [],
        refillSlots: [],
        status: 'ready',
        results: {},
        prelim: null,
        lottery: createLotteryState(),
      })
      return { ok: true, errors: [] }
    }

    const groupCount = normalizeGroupCount(bracket.groupCount, bracket.players.length)
    const { slotsData } = createGroupedSlots(bracket.players, pairingMode, groupCount)
    persist({
      ...bracket,
      pairingMode,
      groupCount,
      bracketSize: slotsData.bracketSize,
      slots: slotsData.slots,
      status: 'ready',
      results: {},
      prelim: null,
      byeSlots: [],
      refillSlots: [],
      lottery: createLotteryState(),
    })
    return { ok: true, errors: [] }
  }

  function setPrelimResult(matchId, winnerSlot, scores = {}) {
    updateCurrent((bracket) => {
      if (bracket.status !== 'prelim' || !bracket.prelim) return bracket
      const current = bracket.prelim.results?.[matchId]
      const nextResults = { ...bracket.prelim.results }
      if (current?.winnerSlot === winnerSlot) {
        delete nextResults[matchId]
      } else {
        nextResults[matchId] = {
          winnerSlot,
          scoreA: scores.scoreA ?? current?.scoreA ?? null,
          scoreB: scores.scoreB ?? current?.scoreB ?? null,
        }
      }
      return { ...bracket, prelim: { ...bracket.prelim, results: nextResults } }
    })
  }

  function updatePrelimScore(matchId, scoreA, scoreB) {
    updateCurrent((bracket) => {
      if (bracket.status !== 'prelim' || !bracket.prelim) return bracket
      const current = bracket.prelim.results?.[matchId]
      if (!current) return bracket
      return {
        ...bracket,
        prelim: {
          ...bracket.prelim,
          results: {
            ...bracket.prelim.results,
            [matchId]: { ...current, scoreA, scoreB },
          },
        },
      }
    })
  }

  function generateKnockoutFromPrelim() {
    const bracket = currentBracket.value
    if (!bracket || bracket.status !== 'prelim' || !bracket.prelim) {
      return { ok: false, errors: ['預賽尚未產生'] }
    }
    const qualification = getPrelimQualification(bracket.prelim, bracket.players)
    if (!qualification.complete) return { ok: false, errors: ['預賽尚未全部完成'] }

    const slots = createPrelimKnockoutSlots(qualification.qualifiers)
    persist({
      ...bracket,
      status: 'ready',
      slots,
      bracketSize: slots.length,
      results: {},
      lottery: createLotteryState(),
    })
    return { ok: true, errors: [] }
  }

  function reopenPrelim() {
    updateCurrent((bracket) => {
      if (bracket.format !== 'prelim' || !bracket.prelim) return bracket
      return { ...bracket, status: 'prelim', slots: [], results: {} }
    })
  }

  function applyFreeSlotFill(bracket, slotIndex, playerId) {
    const index = Number(slotIndex)
    if (!Number.isInteger(index) || index < 0 || index >= bracket.slots.length) return null
    if (bracket.slots[index] === playerId) return null
    const occurrences = bracket.slots.filter((id) => id === playerId).length
    const isLoser = getFirstRoundState(bracket).loserIds.includes(playerId)
    if (occurrences > (isLoser ? 1 : 0)) return null

    const slots = [...bracket.slots]
    const hadPlayer = slots[index] !== null
    slots[index] = playerId
    const results = { ...bracket.results }
    if (hadPlayer) delete results[`r0-m${Math.floor(index / 2)}`]
    const next = {
      ...bracket,
      slots,
      results,
      byeSlots: (bracket.byeSlots ?? []).filter((i) => i !== index),
      refillSlots: [...new Set([...(bracket.refillSlots ?? []), index])],
    }
    return { ...next, results: sanitizeResults(next) }
  }

  function fillFreeSlot(slotIndex, playerId) {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      return applyFreeSlotFill(bracket, slotIndex, playerId) ?? bracket
    })
  }

  function addAndFillFreeSlot(slotIndex, { name, title = '' } = {}) {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      const trimmedName = (name ?? '').trim()
      if (!trimmedName) return bracket
      const player = {
        id: createId('player'),
        name: trimmedName,
        title: (title ?? '').trim(),
        seed: Math.max(0, ...bracket.players.map((item) => Number(item.seed) || 0)) + 1,
        registrationConfirmed: false,
      }
      const withPlayer = { ...bracket, players: [...bracket.players, player] }
      return applyFreeSlotFill(withPlayer, slotIndex, player.id) ?? bracket
    })
  }

  function clearFreeSlot(slotIndex) {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      const index = Number(slotIndex)
      if (!Number.isInteger(index) || index < 0 || index >= bracket.slots.length) return bracket
      if (bracket.slots[index] === null) return bracket
      const slots = [...bracket.slots]
      slots[index] = null
      const results = { ...bracket.results }
      delete results[`r0-m${Math.floor(index / 2)}`]
      const next = {
        ...bracket,
        slots,
        results,
        byeSlots: (bracket.byeSlots ?? []).filter((i) => i !== index),
        refillSlots: (bracket.refillSlots ?? []).filter((i) => i !== index),
      }
      return { ...next, results: sanitizeResults(next) }
    })
  }

  function confirmFreeSlotBye(slotIndex) {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      const index = Number(slotIndex)
      if (!Number.isInteger(index) || index < 0 || index >= bracket.slots.length) return bracket
      if (bracket.slots[index] !== null || bracket.byeSlots.includes(index)) return bracket
      const next = { ...bracket, byeSlots: [...bracket.byeSlots, index] }
      return { ...next, results: sanitizeResults(next) }
    })
  }

  function revokeFreeSlotBye(slotIndex) {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      const index = Number(slotIndex)
      if (!bracket.byeSlots.includes(index)) return bracket
      const next = { ...bracket, byeSlots: bracket.byeSlots.filter((i) => i !== index) }
      return { ...next, results: sanitizeResults(next) }
    })
  }

  function randomFillFreeSlots() {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      const counts = new Map()
      bracket.slots.forEach((id) => {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
      })
      const pool = shufflePlayers(
        getFirstRoundState(bracket).loserIds.filter((id) => (counts.get(id) ?? 0) < 2),
      )
      if (!pool.length) return bracket

      const byeSet = new Set(bracket.byeSlots ?? [])
      const slots = [...bracket.slots]
      const refills = new Set(bracket.refillSlots ?? [])
      let poolIndex = 0
      slots.forEach((slot, index) => {
        if (slot !== null || byeSet.has(index) || poolIndex >= pool.length) return
        slots[index] = pool[poolIndex]
        refills.add(index)
        poolIndex += 1
      })
      if (!poolIndex) return bracket
      const next = { ...bracket, slots, refillSlots: [...refills] }
      return { ...next, results: sanitizeResults(next) }
    })
  }

  function confirmAllRemainingByes() {
    updateCurrent((bracket) => {
      if (bracket.format !== 'free' || bracket.status !== 'ready') return bracket
      const byeSet = new Set(bracket.byeSlots ?? [])
      bracket.slots.forEach((slot, index) => {
        if (slot === null) byeSet.add(index)
      })
      if (byeSet.size === (bracket.byeSlots ?? []).length) return bracket
      const next = { ...bracket, byeSlots: [...byeSet] }
      return { ...next, results: sanitizeResults(next) }
    })
  }

  function setResult(matchId, winnerSlot, scores = {}) {
    updateCurrent((bracket) => {
      const current = bracket.results?.[matchId]
      const isThirdPlaceMatch = matchId === THIRD_PLACE_MATCH_ID
      const changedRoundMatch = /^r(\d+)-m\d+$/.exec(matchId)
      const changedRound = changedRoundMatch ? Number(changedRoundMatch[1]) : null
      const finalRoundIndex = deriveRounds(bracket).length - 1
      const nextResults = Object.fromEntries(
        Object.entries(bracket.results ?? {}).filter(([id]) => {
          if (isThirdPlaceMatch) return true
          if (id === THIRD_PLACE_MATCH_ID) return changedRound >= finalRoundIndex
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
      let nextBracket = { ...bracket, results: nextResults }
      if (bracket.format === 'free' && changedRound === 0) {
        nextBracket = releaseInvalidRefills(nextBracket)
      }
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
    openTabIds,
    openBrackets,
    currentId,
    currentBracket,
    addBracket,
    openBracketTab,
    closeBracketTab,
    deleteBracket,
    resetCurrentBracket,
    updateCurrent,
    renameBracket,
    setPlayerCount,
    addPlayer,
    importPlayers,
    updatePlayer,
    removePlayer,
    reorderPlayerSeeds,
    shufflePlayerSeeds,
    setPairingMode,
    setGroupCount,
    setFormat,
    setPrelimGroupSize,
    setPrelimResult,
    updatePrelimScore,
    generateKnockoutFromPrelim,
    reopenPrelim,
    setFreeSlotCount,
    fillFreeSlot,
    addAndFillFreeSlot,
    clearFreeSlot,
    confirmFreeSlotBye,
    revokeFreeSlotBye,
    randomFillFreeSlots,
    confirmAllRemainingByes,
    generateBracket,
    setResult,
    updateScore,
    updateLottery,
  }
}
