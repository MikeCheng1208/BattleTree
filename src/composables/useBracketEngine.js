export function createId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const THIRD_PLACE_MATCH_ID = 'third-place'
export const FREE_SLOT_COUNT_OPTIONS = [8, 16, 32, 64]

export function getBracketSize(count) {
  if (count <= 2) return 2
  return 2 ** Math.ceil(Math.log2(count))
}

export function getSeedOrder(size) {
  if (size <= 2) return [1, 2]
  return getSeedOrder(size / 2).flatMap((seed, index) => {
    const pair = [seed, size + 1 - seed]
    return index % 2 === 0 ? pair : pair.reverse()
  })
}

export function shufflePlayers(players) {
  const next = [...players]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const range = i + 1
    let randomValue = Math.random()
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1)
      globalThis.crypto.getRandomValues(values)
      randomValue = values[0] / 2 ** 32
    }
    const j = Math.floor(randomValue * range)
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function sortPlayersBySeed(players) {
  return [...players].sort((a, b) => Number(a.seed) - Number(b.seed))
}

function hasAdjacentSeeds(playerA, playerB) {
  const seedA = Number(playerA?.seed)
  const seedB = Number(playerB?.seed)
  return Number.isFinite(seedA) && Number.isFinite(seedB) && Math.abs(seedA - seedB) === 1
}

function createSeededSlots(orderedPlayers, size) {
  return getSeedOrder(size).map((rank) => orderedPlayers[rank - 1]?.id ?? null)
}

export function normalizeFreeSlotCount(count, playerCount = 0) {
  const min = FREE_SLOT_COUNT_OPTIONS.find((option) => option >= Math.max(2, playerCount)) ?? 64
  const requested = Number(count)
  return FREE_SLOT_COUNT_OPTIONS.includes(requested) ? Math.max(requested, min) : min
}

export function createFreeSlots(players, pairingMode = 'order', slotCount) {
  const orderedPlayers = pairingMode === 'random' ? shufflePlayers(players) : sortPlayersBySeed(players)
  return { bracketSize: slotCount, slots: createSeededSlots(orderedPlayers, slotCount) }
}

export function validatePlayers(players) {
  const errors = []
  if (players.length < 2) errors.push('至少需要 2 位選手')

  const seen = new Set()
  players.forEach((player, index) => {
    const seed = Number(player.seed)
    if (!player.name?.trim()) errors.push(`第 ${index + 1} 位選手需要姓名`)
    if (!Number.isInteger(seed) || seed < 1) {
      errors.push(`第 ${index + 1} 位選手編號需為正整數`)
      return
    }
    if (seen.has(seed)) errors.push(`編號 ${seed} 重複`)
    seen.add(seed)
  })

  return [...new Set(errors)]
}

export function createSlots(players, pairingMode = 'order') {
  return createGroupedSlots(players, pairingMode, 1).slotsData
}

function getGroupSizes(playerCount, safeGroupCount) {
  if (safeGroupCount <= 1) return [playerCount]
  const groupPlayerCount = Math.ceil(playerCount / safeGroupCount)
  return Array.from({ length: safeGroupCount }, (_, groupIndex) => {
    const start = groupIndex * groupPlayerCount
    return Math.max(0, Math.min(groupPlayerCount, playerCount - start))
  })
}

export function getFirstRoundPreview(playerCount, groupCount = 1) {
  const safeGroupCount = Math.max(1, Math.min(Number(groupCount) || 1, Math.floor(playerCount / 2) || 1))
  const groupPlayerCount = safeGroupCount <= 1 ? playerCount : Math.ceil(playerCount / safeGroupCount)
  const slotCount = getBracketSize(groupPlayerCount)
  const groups = getGroupSizes(playerCount, safeGroupCount).map((groupSize, index) => {
    const byeCount = Math.min(groupSize, slotCount - groupSize)
    return {
      label: getGroupLabel(index),
      playerCount: groupSize,
      slotCount,
      byeCount,
      matchCount: (groupSize - byeCount) / 2,
    }
  })
  return { slotCount, groups }
}

function getFirstRoundOrderBlocks(playerCount, safeGroupCount) {
  const blocks = []
  let offset = 0
  const groupPlayerCount = safeGroupCount <= 1 ? playerCount : Math.ceil(playerCount / safeGroupCount)
  const groupSlotCount = getBracketSize(groupPlayerCount)

  getGroupSizes(playerCount, safeGroupCount).forEach((groupSize) => {
    for (let rank = 1; rank <= groupSlotCount / 2; rank += 1) {
      const partnerRank = groupSlotCount + 1 - rank
      const indexes = []
      if (rank <= groupSize) indexes.push(offset + rank - 1)
      if (partnerRank <= groupSize) indexes.push(offset + partnerRank - 1)
      if (indexes.length) blocks.push({ type: indexes.length === 2 ? 'pair' : 'single', indexes })
    }
    offset += groupSize
  })

  return blocks
}

function takeCompatiblePair(remaining) {
  const indexes = shufflePlayers(Array.from({ length: remaining.length }, (_, index) => index))

  for (const firstIndex of indexes) {
    const secondIndexes = shufflePlayers(indexes.filter((index) => index !== firstIndex))
    const secondIndex = secondIndexes.find((index) => !hasAdjacentSeeds(remaining[firstIndex], remaining[index]))
    if (secondIndex === undefined) continue

    const sortedIndexes = [firstIndex, secondIndex].sort((a, b) => b - a)
    const pair = []
    sortedIndexes.forEach((index) => {
      pair.unshift(remaining.splice(index, 1)[0])
    })
    return shufflePlayers(pair)
  }

  return null
}

function countAdjacentSeedPairings(orderedPlayers, safeGroupCount) {
  return getFirstRoundOrderBlocks(orderedPlayers.length, safeGroupCount).filter(
    (block) =>
      block.type === 'pair' &&
      hasAdjacentSeeds(orderedPlayers[block.indexes[0]], orderedPlayers[block.indexes[1]]),
  ).length
}

function arrangePlayersAvoidingAdjacentSeeds(players, safeGroupCount) {
  const blocks = getFirstRoundOrderBlocks(players.length, safeGroupCount)
  const pairBlocks = blocks.filter((block) => block.type === 'pair')
  const singleBlocks = blocks.filter((block) => block.type === 'single')
  if (!pairBlocks.length) return shufflePlayers(players)

  let bestOrder = shufflePlayers(players)
  let bestViolationCount = countAdjacentSeedPairings(bestOrder, safeGroupCount)
  if (!bestViolationCount) return bestOrder

  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const remaining = shufflePlayers(players)
    const orderedPlayers = Array.from({ length: players.length }, () => null)
    const shuffledPairBlocks = shufflePlayers(pairBlocks)
    let valid = true

    for (const block of shuffledPairBlocks) {
      const pair = takeCompatiblePair(remaining)
      if (!pair) {
        valid = false
        break
      }
      orderedPlayers[block.indexes[0]] = pair[0]
      orderedPlayers[block.indexes[1]] = pair[1]
    }

    if (valid) {
      shufflePlayers(singleBlocks).forEach((block) => {
        orderedPlayers[block.indexes[0]] = remaining.pop()
      })
    }

    if (!valid || orderedPlayers.some((player) => !player)) continue

    const violationCount = countAdjacentSeedPairings(orderedPlayers, safeGroupCount)
    if (!violationCount) return orderedPlayers
    if (violationCount < bestViolationCount) {
      bestOrder = orderedPlayers
      bestViolationCount = violationCount
    }
  }

  return bestOrder
}

function createGroupedSlotsFromOrderedPlayers(orderedPlayers, safeGroupCount) {
  const bracketSize = getBracketSize(orderedPlayers.length)
  if (safeGroupCount <= 1) {
    const slots = createSeededSlots(orderedPlayers, bracketSize)

    return {
      slotsData: { bracketSize, slots },
      groups: [{ label: 'A', startSlot: 0, slotCount: bracketSize, playerCount: orderedPlayers.length }],
    }
  }

  const groupPlayerCount = Math.ceil(orderedPlayers.length / safeGroupCount)
  const groupSlotCount = getBracketSize(groupPlayerCount)
  const slots = Array.from({ length: groupSlotCount * safeGroupCount }, () => null)
  const groups = []

  for (let groupIndex = 0; groupIndex < safeGroupCount; groupIndex += 1) {
    const groupPlayers = orderedPlayers.slice(groupIndex * groupPlayerCount, (groupIndex + 1) * groupPlayerCount)
    const startSlot = groupIndex * groupSlotCount
    groups.push({
      label: getGroupLabel(groupIndex),
      startSlot,
      slotCount: groupSlotCount,
      playerCount: groupPlayers.length,
    })
    createSeededSlots(groupPlayers, groupSlotCount).forEach((playerId, index) => {
      slots[startSlot + index] = playerId
    })
  }

  return {
    slotsData: { bracketSize: slots.length, slots },
    groups,
  }
}

export function createGroupedSlots(players, pairingMode = 'order', groupCount = 1) {
  const safeGroupCount = Math.max(1, Math.min(Number(groupCount) || 1, Math.floor(players.length / 2) || 1))
  const orderedPlayers =
    pairingMode === 'random'
      ? arrangePlayersAvoidingAdjacentSeeds(players, safeGroupCount)
      : sortPlayersBySeed(players)
  return createGroupedSlotsFromOrderedPlayers(orderedPlayers, safeGroupCount)
}

export function getGroupLabel(index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (index < alphabet.length) return alphabet[index]
  return `${alphabet[Math.floor(index / alphabet.length) - 1]}${alphabet[index % alphabet.length]}`
}

export function getBracketGroups(bracket) {
  const groupCount = Number(bracket?.groupCount) || 1
  const slots = bracket?.slots ?? []
  if (groupCount <= 1 || !slots.length) return []
  const groupSlotCount = slots.length / groupCount
  if (!Number.isInteger(groupSlotCount)) return []
  return Array.from({ length: groupCount }, (_, index) => ({
    label: getGroupLabel(index),
    startSlot: index * groupSlotCount,
    slotCount: groupSlotCount,
    playerCount: slots.slice(index * groupSlotCount, (index + 1) * groupSlotCount).filter(Boolean).length,
  }))
}

function resolveSlot(slot, previousWinners) {
  if (slot === null) return { playerId: null, pending: false, sourceMatchId: null }
  if (typeof slot === 'string') return { playerId: slot, pending: false, sourceMatchId: null }
  const winner = previousWinners.get(slot.fromMatchId)
  return {
    playerId: winner ?? null,
    pending: !winner,
    sourceMatchId: slot.fromMatchId,
  }
}

function getManualWinner(match, result) {
  if (!result || result.winnerSlot === null || result.winnerSlot === undefined) return null
  return result.winnerSlot === 0 ? match.playerA : match.playerB
}

function getMatchLoserId(match) {
  if (!match?.isPlayable || !match.winnerId) return null
  return match.winnerId === match.playerA ? match.playerB : match.playerA
}

function getSourceMatchId(slot) {
  return typeof slot === 'object' && slot ? slot.fromMatchId : null
}

export function deriveRounds(bracket) {
  const slots = bracket?.slots?.length ? bracket.slots : []
  const results = bracket?.results ?? {}
  const rounds = []
  let currentSlots = slots
  let previousWinners = new Map()
  const isFree = bracket?.format === 'free'
  const byeSet = new Set(isFree ? bracket?.byeSlots ?? [] : [])
  let roundIndex = 0

  while (currentSlots.length >= 2) {
    const matches = []
    const nextSlots = []
    const currentWinners = new Map()

    for (let matchIndex = 0; matchIndex < currentSlots.length / 2; matchIndex += 1) {
      const id = `r${roundIndex}-m${matchIndex}`
      const slotA = currentSlots[matchIndex * 2]
      const slotB = currentSlots[matchIndex * 2 + 1]
      const resolvedA = resolveSlot(slotA, previousWinners)
      const resolvedB = resolveSlot(slotB, previousWinners)
      const hasPlayerA = Boolean(resolvedA.playerId)
      const hasPlayerB = Boolean(resolvedB.playerId)
      const isWaiting = resolvedA.pending || resolvedB.pending
      // 自由編排：第一輪的空格未確認輪空前為「待定」，不自動晉級
      const isFreeFirstRound = isFree && roundIndex === 0
      const awaitingA = isFreeFirstRound && slotA === null && !byeSet.has(matchIndex * 2)
      const awaitingB = isFreeFirstRound && slotB === null && !byeSet.has(matchIndex * 2 + 1)
      const isAwaitingEntry = awaitingA || awaitingB
      const isBye = !isWaiting && !isAwaitingEntry && ((hasPlayerA && !hasPlayerB) || (hasPlayerB && !hasPlayerA))
      const isPlayable = hasPlayerA && hasPlayerB && !isWaiting
      const isEmpty = !hasPlayerA && !hasPlayerB && !isWaiting && !isAwaitingEntry
      const result = results[id] ?? null

      let winnerId = null
      if (isBye) winnerId = resolvedA.playerId ?? resolvedB.playerId
      else if (isPlayable) winnerId = getManualWinner({ playerA: resolvedA.playerId, playerB: resolvedB.playerId }, result)

      const match = {
        id,
        roundIndex,
        matchIndex,
        slotA,
        slotB,
        playerA: resolvedA.playerId,
        playerB: resolvedB.playerId,
        winnerId,
        isBye,
        isEmpty,
        isWaiting,
        isAwaitingEntry,
        awaitingA,
        awaitingB,
        isPlayable,
        result,
      }

      matches.push(match)
      currentWinners.set(id, winnerId)
      nextSlots.push(
        hasPlayerA || hasPlayerB || resolvedA.pending || resolvedB.pending || isAwaitingEntry
          ? { fromMatchId: id }
          : null,
      )
    }

    rounds.push(matches)
    if (nextSlots.length === 1) break
    previousWinners = currentWinners
    currentSlots = nextSlots
    roundIndex += 1
  }

  return rounds
}

export function getFirstRoundState(bracket) {
  const firstRound = deriveRounds(bracket)[0] ?? []
  const playableMatches = firstRound.filter((match) => match.isPlayable || match.result)
  const completedMatches = playableMatches.filter((match) => match.winnerId)
  const loserIds = completedMatches.map(getMatchLoserId).filter(Boolean)
  return {
    total: playableMatches.length,
    completed: completedMatches.length,
    complete: playableMatches.length > 0 && completedMatches.length === playableMatches.length,
    loserIds,
  }
}

export function getChampionId(bracket) {
  const rounds = deriveRounds(bracket)
  const finalRound = rounds[rounds.length - 1]
  return finalRound?.[0]?.winnerId ?? null
}

export function getThirdPlaceMatch(bracket) {
  const rounds = deriveRounds(bracket)
  if (rounds.length < 2) return null

  const finalMatch = rounds[rounds.length - 1]?.[0]
  if (!finalMatch) return null

  const matchMap = new Map(rounds.flat().map((match) => [match.id, match]))
  const findFinalistBranchLoser = (sourceMatchId, finalistId, seen = new Set()) => {
    if (!sourceMatchId || seen.has(sourceMatchId)) return null
    seen.add(sourceMatchId)

    const match = matchMap.get(sourceMatchId)
    if (!match || match.winnerId !== finalistId) return null

    const loserId = getMatchLoserId(match)
    if (loserId) return loserId

    let nextSource = getSourceMatchId(match.slotA) ?? getSourceMatchId(match.slotB)
    if (match.playerA === finalistId) nextSource = getSourceMatchId(match.slotA)
    if (match.playerB === finalistId) nextSource = getSourceMatchId(match.slotB)
    return findFinalistBranchLoser(nextSource, finalistId, seen)
  }

  const playerA = findFinalistBranchLoser(getSourceMatchId(finalMatch.slotA), finalMatch.playerA)
  const playerB = findFinalistBranchLoser(getSourceMatchId(finalMatch.slotB), finalMatch.playerB)
  if (!playerA || !playerB) return null

  const result = bracket?.results?.[THIRD_PLACE_MATCH_ID] ?? null
  const winnerId = getManualWinner({ playerA, playerB }, result)

  return {
    id: THIRD_PLACE_MATCH_ID,
    roundIndex: rounds.length,
    matchIndex: 0,
    slotA: playerA,
    slotB: playerB,
    playerA,
    playerB,
    winnerId,
    isBye: false,
    isEmpty: false,
    isWaiting: false,
    isPlayable: true,
    isThirdPlace: true,
    result,
  }
}

export function getPodium(bracket) {
  const rounds = deriveRounds(bracket)
  const finalMatch = rounds[rounds.length - 1]?.[0]
  const thirdPlaceMatch = getThirdPlaceMatch(bracket)
  const championId = finalMatch?.winnerId ?? null
  const runnerUpId = getMatchLoserId(finalMatch)
  const thirdPlaceId = thirdPlaceMatch?.winnerId ?? null
  const fourthPlaceId =
    thirdPlaceMatch?.winnerId === thirdPlaceMatch?.playerA
      ? thirdPlaceMatch?.playerB
      : thirdPlaceMatch?.winnerId === thirdPlaceMatch?.playerB
        ? thirdPlaceMatch?.playerA
        : null

  return {
    championId,
    runnerUpId,
    thirdPlaceId,
    fourthPlaceId,
    thirdPlaceMatch,
  }
}

export function sanitizeResults(bracket) {
  const rounds = deriveRounds(bracket)
  const validResults = {}

  rounds.flat().forEach((match) => {
    const result = bracket.results?.[match.id]
    if (!result || !match.isPlayable) return
    const winnerId = result.winnerSlot === 0 ? match.playerA : match.playerB
    if (winnerId) {
      validResults[match.id] = {
        winnerSlot: result.winnerSlot,
        scoreA: result.scoreA ?? null,
        scoreB: result.scoreB ?? null,
      }
    }
  })

  const thirdPlaceMatch = getThirdPlaceMatch(bracket)
  const thirdPlaceResult = bracket.results?.[THIRD_PLACE_MATCH_ID]
  if (thirdPlaceMatch?.isPlayable && thirdPlaceResult) {
    const winnerId = thirdPlaceResult.winnerSlot === 0 ? thirdPlaceMatch.playerA : thirdPlaceMatch.playerB
    if (winnerId) {
      validResults[THIRD_PLACE_MATCH_ID] = {
        winnerSlot: thirdPlaceResult.winnerSlot,
        scoreA: thirdPlaceResult.scoreA ?? null,
        scoreB: thirdPlaceResult.scoreB ?? null,
      }
    }
  }

  return validResults
}

export function getLosersByRound(bracket, roundIndex) {
  const rounds = deriveRounds(bracket)
  const round = rounds[roundIndex] ?? []
  return round
    .filter((match) => match.isPlayable && match.winnerId)
    .map((match) => (match.winnerId === match.playerA ? match.playerB : match.playerA))
    .filter(Boolean)
}

export function getRoundLabels(bracket) {
  const rounds = deriveRounds(bracket)
  return rounds
    .map((_, index) => ({
      value: `loser-r${index}`,
      label: `第 ${index + 1} 輪敗者`,
      count: getLosersByRound(bracket, index).length,
    }))
    .filter((item) => item.count > 0)
}

export function getPlayerMap(players) {
  return Object.fromEntries((players ?? []).map((player) => [player.id, player]))
}

export function buildInitialPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: createId('player'),
    name: `Player${index + 1}`,
    title: '',
    seed: index + 1,
    registrationConfirmed: false,
  }))
}
