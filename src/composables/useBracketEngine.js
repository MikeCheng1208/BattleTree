export function createId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const THIRD_PLACE_MATCH_ID = 'third-place'
export const REPECHAGE_MATCH_PREFIX = 'repechage-'

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

function createSequentialSlots(players, size) {
  const slots = Array.from({ length: size }, () => null)
  players.forEach((player, index) => {
    slots[index] = player.id
  })
  return slots
}

export function analyzeRepechageTargets(slots, groupCount = 1) {
  let states = (slots ?? []).map((playerId, index) => ({
    active: Boolean(playerId),
    byeStreak: 0,
    pendingByeTarget: null,
    startSlot: index,
    slotCount: 1,
  }))
  const targets = []
  let roundIndex = 0

  while (states.length >= 2) {
    const nextStates = []
    for (let matchIndex = 0; matchIndex < states.length / 2; matchIndex += 1) {
      const sideA = states[matchIndex * 2]
      const sideB = states[matchIndex * 2 + 1]
      const activeSides = Number(sideA.active) + Number(sideB.active)
      let nextState

      if (activeSides === 2) {
        nextState = {
          active: true,
          byeStreak: 0,
          pendingByeTarget: null,
          startSlot: sideA.startSlot,
          slotCount: sideA.slotCount + sideB.slotCount,
        }
      } else if (activeSides === 1) {
        const activeSide = sideA.active ? sideA : sideB
        const emptySide = sideA.active ? 1 : 0
        const needsRepechage = activeSide.byeStreak >= 1
        const initialSlotsPerGroup = (slots?.length ?? 0) / Math.max(1, Number(groupCount) || 1)
        const targetStartSlot = sideA.startSlot
        const byeTarget = {
          targetRoundIndex: roundIndex,
          targetMatchIndex: matchIndex,
          targetSide: emptySide,
          groupIndex:
            Number(groupCount) > 1 && initialSlotsPerGroup
              ? Math.min(Number(groupCount) - 1, Math.floor(targetStartSlot / initialSlotsPerGroup))
              : null,
        }
        if (needsRepechage) {
          targets.push({
            id: `repechage-target-${targets.length}`,
            ...(activeSide.pendingByeTarget ?? byeTarget),
          })
        }
        nextState = {
          active: true,
          byeStreak: needsRepechage ? 0 : activeSide.byeStreak + 1,
          pendingByeTarget: needsRepechage ? null : (activeSide.pendingByeTarget ?? byeTarget),
          startSlot: sideA.startSlot,
          slotCount: sideA.slotCount + sideB.slotCount,
        }
      } else {
        nextState = {
          active: false,
          byeStreak: 0,
          pendingByeTarget: null,
          startSlot: sideA.startSlot,
          slotCount: sideA.slotCount + sideB.slotCount,
        }
      }

      nextStates.push(nextState)
    }
    states = nextStates
    roundIndex += 1
  }

  return targets
}

export function getRepechageRequirements(players, pairingMode = 'order', groupCount = 1) {
  const { slotsData } = createGroupedSlots(players, pairingMode === 'random' ? 'order' : pairingMode, groupCount)
  const availableTargets = analyzeRepechageInsertionTargets(slotsData.slots, groupCount)
  return {
    targets: availableTargets,
    matchCount: Math.ceil(availableTargets.length / 2),
    playerCount: availableTargets.length,
  }
}

export function analyzeRepechageInsertionTargets(slots, groupCount = 1) {
  if (!analyzeRepechageTargets(slots, groupCount).length) return []

  const firstRoundSlots = []
  for (let matchIndex = 0; matchIndex < (slots?.length ?? 0) / 2; matchIndex += 1) {
    const hasPlayer = Boolean(slots[matchIndex * 2] || slots[matchIndex * 2 + 1])
    firstRoundSlots.push(hasPlayer ? { fromMatchId: `r0-m${matchIndex}` } : null)
  }

  const targets = []
  const initialSlotsPerGroup = (slots?.length ?? 0) / Math.max(1, Number(groupCount) || 1)
  firstRoundSlots.forEach((slot, index) => {
    if (slot) return
    const targetMatchIndex = Math.floor(index / 2)
    const targetSide = index % 2
    const targetStartSlot = targetMatchIndex * 4
    targets.push({
      id: `repechage-target-${targets.length}`,
      targetRoundIndex: 1,
      targetMatchIndex,
      targetSide,
      groupIndex:
        Number(groupCount) > 1 && initialSlotsPerGroup
          ? Math.min(Number(groupCount) - 1, Math.floor(targetStartSlot / initialSlotsPerGroup))
          : null,
    })
  })

  return targets
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

function getFirstRoundOrderBlocks(playerCount, safeGroupCount) {
  const blocks = []
  let offset = 0

  getGroupSizes(playerCount, safeGroupCount).forEach((groupSize) => {
    for (let localIndex = 0; localIndex < groupSize; localIndex += 2) {
      const indexes = [offset + localIndex]
      if (localIndex + 1 < groupSize) indexes.push(offset + localIndex + 1)
      blocks.push({ type: indexes.length === 2 ? 'pair' : 'single', indexes })
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
    const slots = createSequentialSlots(orderedPlayers, bracketSize)

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
    groupPlayers.forEach((player, index) => {
      slots[startSlot + index] = player.id
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

function resolveSlot(slot, previousWinners, injectedPlayerId = null) {
  if (injectedPlayerId) return { playerId: injectedPlayerId, pending: false, sourceMatchId: null }
  if (slot === null) return { playerId: null, pending: false, sourceMatchId: null }
  if (typeof slot === 'string') return { playerId: slot, pending: false, sourceMatchId: null }
  const winner = previousWinners.get(slot.fromMatchId)
  return {
    playerId: winner ?? null,
    pending: !winner,
    sourceMatchId: slot.fromMatchId,
  }
}

function getRepechageWinnerMap(bracket) {
  const winnerMap = new Map()
  const matches = bracket?.repechage?.matches ?? []
  matches.forEach((match) => {
    if (match.entryPlayerId) {
      winnerMap.set(match.targetId, match.entryPlayerId)
      return
    }
    const result = bracket?.results?.[match.id]
    if (!result) return
    const winnerId = result.winnerSlot === 0 ? match.playerAId : match.playerBId
    if (winnerId) winnerMap.set(match.targetId, winnerId)
  })
  return winnerMap
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
  const repechageWinnerMap = getRepechageWinnerMap(bracket)
  const repechageTargets = bracket?.repechage?.targets ?? []
  let roundIndex = 0

  while (currentSlots.length >= 2) {
    const matches = []
    const nextSlots = []
    const currentWinners = new Map()

    for (let matchIndex = 0; matchIndex < currentSlots.length / 2; matchIndex += 1) {
      const id = `r${roundIndex}-m${matchIndex}`
      const slotA = currentSlots[matchIndex * 2]
      const slotB = currentSlots[matchIndex * 2 + 1]
      const targetA = repechageTargets.find(
        (target) =>
          target.targetRoundIndex === roundIndex &&
          target.targetMatchIndex === matchIndex &&
          target.targetSide === 0,
      )
      const targetB = repechageTargets.find(
        (target) =>
          target.targetRoundIndex === roundIndex &&
          target.targetMatchIndex === matchIndex &&
          target.targetSide === 1,
      )
      const resolvedA = resolveSlot(slotA, previousWinners, repechageWinnerMap.get(targetA?.id))
      const resolvedB = resolveSlot(slotB, previousWinners, repechageWinnerMap.get(targetB?.id))
      const isRepechagePlayerA = Boolean(targetA && repechageWinnerMap.get(targetA.id))
      const isRepechagePlayerB = Boolean(targetB && repechageWinnerMap.get(targetB.id))
      const hasPlayerA = Boolean(resolvedA.playerId)
      const hasPlayerB = Boolean(resolvedB.playerId)
      const isWaiting = resolvedA.pending || resolvedB.pending
      const waitsForRepechage =
        Boolean(targetA && !repechageWinnerMap.get(targetA.id)) ||
        Boolean(targetB && !repechageWinnerMap.get(targetB.id))
      const isBye = !isWaiting && !waitsForRepechage && ((hasPlayerA && !hasPlayerB) || (hasPlayerB && !hasPlayerA))
      const isPlayable = hasPlayerA && hasPlayerB && !isWaiting && !waitsForRepechage
      const isEmpty = !hasPlayerA && !hasPlayerB && !isWaiting && !waitsForRepechage
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
        waitsForRepechage,
        isPlayable,
        isRepechagePlayerA,
        isRepechagePlayerB,
        result,
      }

      matches.push(match)
      currentWinners.set(id, winnerId)
      nextSlots.push(hasPlayerA || hasPlayerB || resolvedA.pending || resolvedB.pending ? { fromMatchId: id } : null)
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

export function getRepechageMatches(bracket) {
  return (bracket?.repechage?.matches ?? []).map((match, index) => {
    if (match.entryPlayerId) {
      return {
        id: match.id || `${REPECHAGE_MATCH_PREFIX}${index}`,
        roundIndex: -1,
        matchIndex: index,
        slotA: match.entryPlayerId,
        slotB: null,
        playerA: match.entryPlayerId,
        playerB: null,
        winnerId: match.entryPlayerId,
        isBye: false,
        isEmpty: false,
        isWaiting: false,
        isPlayable: false,
        isRepechage: true,
        isEntry: true,
        targetId: match.targetId,
        result: null,
      }
    }
    const result = bracket?.results?.[match.id] ?? null
    const winnerId = getManualWinner(
      { playerA: match.playerAId, playerB: match.playerBId },
      result,
    )
    return {
      id: match.id || `${REPECHAGE_MATCH_PREFIX}${index}`,
      roundIndex: -1,
      matchIndex: index,
      slotA: match.playerAId,
      slotB: match.playerBId,
      playerA: match.playerAId,
      playerB: match.playerBId,
      winnerId,
      isBye: false,
      isEmpty: false,
      isWaiting: false,
      isPlayable: Boolean(match.playerAId && match.playerBId),
      isRepechage: true,
      targetId: match.targetId,
      result,
    }
  })
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

  getRepechageMatches(bracket).forEach((match) => {
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
    seed: index + 1,
    registrationConfirmed: false,
  }))
}
