import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import {
  buildInitialPlayers,
  createGroupedSlots,
  createId,
  deriveRounds,
  getFirstRoundState,
  getRepechageRequirements,
  REPECHAGE_MATCH_PREFIX,
  sanitizeResults,
  shufflePlayers,
  THIRD_PLACE_MATCH_ID,
  validatePlayers,
} from './useBracketEngine'

const STORAGE_BRACKETS = 'battletree:brackets'
const STORAGE_CURRENT_ID = 'battletree:currentId'
const DEFAULT_PLAYER_COUNT = 4
const GROUP_COUNT_OPTIONS = [1, 2, 4, 8]

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

function createRepechageState() {
  return {
    enabled: false,
    selectionMode: 'random',
    targets: [],
    selectedPlayerIds: [],
    matches: [],
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
    groupCount: 1,
    bracketSize: DEFAULT_PLAYER_COUNT,
    slots: [],
    results: {},
    repechage: createRepechageState(),
    lottery: createLotteryState(),
    ...overrides,
  }
}

function normalizeBracket(bracket) {
  const fallback = createBracket()
  const players =
    Array.isArray(bracket?.players) && bracket.players.length
      ? bracket.players.map((player, index) => ({
          id: player.id || createId('player'),
          name: typeof player.name === 'string' ? player.name : `Player${index + 1}`,
          seed: Number(player.seed) || index + 1,
          registrationConfirmed: Boolean(player.registrationConfirmed),
        }))
      : fallback.players
  const normalized = {
    ...fallback,
    ...bracket,
    version: 1,
    players,
    slots: Array.isArray(bracket?.slots) ? bracket.slots : [],
    results: bracket?.results && typeof bracket.results === 'object' ? bracket.results : {},
    repechage: {
      ...createRepechageState(),
      ...(bracket?.repechage ?? {}),
      targets: Array.isArray(bracket?.repechage?.targets) ? bracket.repechage.targets : [],
      selectedPlayerIds: Array.isArray(bracket?.repechage?.selectedPlayerIds)
        ? bracket.repechage.selectedPlayerIds
        : [],
      matches: Array.isArray(bracket?.repechage?.matches) ? bracket.repechage.matches : [],
    },
    lottery: {
      ...createLotteryState(),
      ...(bracket?.lottery ?? {}),
    },
  }
  normalized.bracketSize = normalized.slots.length || normalized.bracketSize || normalized.players.length
  normalized.groupCount = normalizeGroupCount(normalized.groupCount, normalized.players.length)
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
        repechage: {
          ...createRepechageState(),
          enabled: bracket.repechage?.enabled ?? false,
          selectionMode: bracket.repechage?.selectionMode ?? 'random',
        },
        lottery: createLotteryState(),
      }
    })
  }

  function importPlayers(names) {
    const importedNames = names.map((name) => name.trim()).filter(Boolean)
    if (importedNames.length < 2) return

    updateCurrent((bracket) => {
      const players = importedNames.map((name, index) => ({
        id: createId('player'),
        name,
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
        repechage: {
          ...createRepechageState(),
          enabled: bracket.repechage?.enabled ?? false,
          selectionMode: bracket.repechage?.selectionMode ?? 'random',
        },
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
      repechage:
        bracket.status === 'ready'
          ? {
              ...createRepechageState(),
              enabled: bracket.repechage?.enabled ?? false,
              selectionMode: bracket.repechage?.selectionMode ?? 'random',
            }
          : bracket.repechage,
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
        repechage: {
          ...createRepechageState(),
          enabled: bracket.repechage?.enabled ?? false,
          selectionMode: bracket.repechage?.selectionMode ?? 'random',
        },
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
      repechage: {
        ...createRepechageState(),
        enabled: bracket.repechage?.enabled ?? false,
        selectionMode: bracket.repechage?.selectionMode ?? 'random',
      },
      lottery: createLotteryState(),
    }))
  }

  function setPairingMode(pairingMode) {
    updateCurrent((bracket) => ({
      ...bracket,
      pairingMode,
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
      repechage:
        bracket.status === 'ready'
          ? {
              ...createRepechageState(),
              enabled: bracket.repechage?.enabled ?? false,
              selectionMode: bracket.repechage?.selectionMode ?? 'random',
            }
          : bracket.repechage,
    }))
  }

  function setGroupCount(groupCount) {
    updateCurrent((bracket) => ({
      ...bracket,
      groupCount: normalizeGroupCount(groupCount, bracket.players.length),
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
      repechage:
        bracket.status === 'ready'
          ? {
              ...createRepechageState(),
              enabled: bracket.repechage?.enabled ?? false,
              selectionMode: bracket.repechage?.selectionMode ?? 'random',
            }
          : bracket.repechage,
    }))
  }

  function setRepechageEnabled(enabled) {
    updateCurrent((bracket) => ({
      ...bracket,
      status: bracket.status === 'ready' ? 'setup' : bracket.status,
      slots: bracket.status === 'ready' ? [] : bracket.slots,
      results: bracket.status === 'ready' ? {} : bracket.results,
      repechage: {
        ...createRepechageState(),
        enabled: Boolean(enabled),
        selectionMode: bracket.repechage?.selectionMode ?? 'random',
      },
    }))
  }

  function setRepechageSelectionMode(selectionMode) {
    updateCurrent((bracket) => ({
      ...bracket,
      repechage: {
        ...bracket.repechage,
        selectionMode: selectionMode === 'manual' ? 'manual' : 'random',
        selectedPlayerIds: [],
        matches: [],
      },
      results: Object.fromEntries(
        Object.entries(bracket.results ?? {}).filter(([id]) => !id.startsWith(REPECHAGE_MATCH_PREFIX)),
      ),
    }))
  }

  function generateBracket(forceMode) {
    const bracket = currentBracket.value
    if (!bracket) return { ok: false, errors: ['找不到目前對戰表'] }
    const errors = validatePlayers(bracket.players)
    if (errors.length) return { ok: false, errors }

    const pairingMode = forceMode ?? bracket.pairingMode
    const groupCount = normalizeGroupCount(bracket.groupCount, bracket.players.length)
    const { slotsData } = createGroupedSlots(bracket.players, pairingMode, groupCount)
    const requirements = getRepechageRequirements(bracket.players, pairingMode, groupCount)
    persist({
      ...bracket,
      pairingMode,
      groupCount,
      bracketSize: slotsData.bracketSize,
      slots: slotsData.slots,
      status: 'ready',
      results: {},
      repechage: {
        ...createRepechageState(),
        enabled: bracket.repechage?.enabled ?? false,
        selectionMode: bracket.repechage?.selectionMode ?? 'random',
        targets: bracket.repechage?.enabled ? requirements.targets : [],
      },
      lottery: createLotteryState(),
    })
    return { ok: true, errors: [] }
  }

  function setResult(matchId, winnerSlot, scores = {}) {
    updateCurrent((bracket) => {
      const current = bracket.results?.[matchId]
      const isThirdPlaceMatch = matchId === THIRD_PLACE_MATCH_ID
      const isRepechageMatch = matchId.startsWith(REPECHAGE_MATCH_PREFIX)
      const changedRoundMatch = /^r(\d+)-m\d+$/.exec(matchId)
      const changedRound = changedRoundMatch ? Number(changedRoundMatch[1]) : null
      const finalRoundIndex = deriveRounds(bracket).length - 1
      const repechageTarget = isRepechageMatch
        ? bracket.repechage?.targets?.find(
            (target) =>
              target.id === bracket.repechage?.matches?.find((match) => match.id === matchId)?.targetId,
          )
        : null
      const nextResults = Object.fromEntries(
        Object.entries(bracket.results ?? {}).filter(([id]) => {
          if (isThirdPlaceMatch) return true
          if (isRepechageMatch) {
            if (id === THIRD_PLACE_MATCH_ID) return false
            if (id.startsWith(REPECHAGE_MATCH_PREFIX)) return true
            const round = Number(/^r(\d+)-m\d+$/.exec(id)?.[1] ?? 0)
            return round < (repechageTarget?.targetRoundIndex ?? 0)
          }
          if (changedRound === 0 && id.startsWith(REPECHAGE_MATCH_PREFIX)) return false
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
      const nextBracket = {
        ...bracket,
        results: nextResults,
        repechage:
          !isThirdPlaceMatch && !isRepechageMatch && changedRound === 0
            ? {
                ...bracket.repechage,
                selectedPlayerIds: [],
                matches: [],
              }
            : bracket.repechage,
      }
      return { ...nextBracket, results: sanitizeResults(nextBracket) }
    })
  }

  function configureRepechage(selectedPlayerIds = null) {
    const bracket = currentBracket.value
    if (!bracket?.repechage?.enabled) return { ok: false, errors: ['敗部復活模式尚未啟用'] }
    const firstRound = getFirstRoundState(bracket)
    if (!firstRound.complete) return { ok: false, errors: ['第一輪尚未全部完成'] }

    const requiredCount = (bracket.repechage.targets?.length ?? 0) * 2
    if (!requiredCount) return { ok: false, errors: ['目前賽程不需要敗部復活'] }
    if (firstRound.loserIds.length < requiredCount) {
      return { ok: false, errors: ['第一輪敗者人數不足，無法建立敗部復活賽'] }
    }

    const candidateIds =
      bracket.repechage.selectionMode === 'manual'
        ? [...new Set(selectedPlayerIds ?? [])]
        : shufflePlayers(firstRound.loserIds).slice(0, requiredCount)
    if (candidateIds.length !== requiredCount || candidateIds.some((id) => !firstRound.loserIds.includes(id))) {
      return { ok: false, errors: [`請選擇 ${requiredCount} 位第一輪敗者`] }
    }

    const pairedIds = shufflePlayers(candidateIds)
    const matches = bracket.repechage.targets.map((target, index) => ({
      id: `${REPECHAGE_MATCH_PREFIX}${index}`,
      playerAId: pairedIds[index * 2],
      playerBId: pairedIds[index * 2 + 1],
      targetId: target.id,
    }))
    updateCurrent((current) => ({
      ...current,
      repechage: {
        ...current.repechage,
        selectedPlayerIds: candidateIds,
        matches,
      },
      results: Object.fromEntries(
        Object.entries(current.results ?? {}).filter(([id]) => !id.startsWith(REPECHAGE_MATCH_PREFIX)),
      ),
    }))
    return { ok: true, errors: [] }
  }

  function resetRepechageSelection() {
    updateCurrent((bracket) => {
      const hasStarted = (bracket.repechage?.matches ?? []).some(
        (match) => bracket.results?.[match.id]?.winnerSlot !== undefined,
      )
      if (hasStarted) return bracket
      return {
        ...bracket,
        repechage: {
          ...bracket.repechage,
          selectedPlayerIds: [],
          matches: [],
        },
        results: Object.fromEntries(
          Object.entries(bracket.results ?? {}).filter(([id]) => !id.startsWith(REPECHAGE_MATCH_PREFIX)),
        ),
      }
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
    resetCurrentBracket,
    updateCurrent,
    setPlayerCount,
    importPlayers,
    updatePlayer,
    removePlayer,
    reorderPlayerSeeds,
    setPairingMode,
    setGroupCount,
    setRepechageEnabled,
    setRepechageSelectionMode,
    generateBracket,
    configureRepechage,
    resetRepechageSelection,
    setResult,
    updateScore,
    updateLottery,
  }
}
