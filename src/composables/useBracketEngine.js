export function createId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function sortPlayersBySeed(players) {
  return [...players].sort((a, b) => Number(a.seed) - Number(b.seed))
}

export function validatePlayers(players) {
  const errors = []
  if (players.length < 2) errors.push('至少需要 2 位選手')

  const seen = new Set()
  players.forEach((player, index) => {
    const seed = Number(player.seed)
    if (!player.name?.trim()) errors.push(`第 ${index + 1} 位選手需要姓名`)
    if (!Number.isInteger(seed) || seed < 1 || seed > players.length) {
      errors.push(`第 ${index + 1} 位選手編號需為 1 至 ${players.length} 的整數`)
    }
    if (seen.has(seed)) errors.push(`編號 ${seed} 重複`)
    seen.add(seed)
  })

  return [...new Set(errors)]
}

export function createSlots(players, pairingMode = 'order') {
  return createGroupedSlots(players, pairingMode, 1).slotsData
}

export function createGroupedSlots(players, pairingMode = 'order', groupCount = 1) {
  const bracketSize = getBracketSize(players.length)
  const orderedPlayers = pairingMode === 'random' ? shufflePlayers(players) : sortPlayersBySeed(players)
  const safeGroupCount = Math.max(1, Math.min(Number(groupCount) || 1, Math.floor(players.length / 2) || 1))
  if (safeGroupCount <= 1) {
    const seedOrder = getSeedOrder(bracketSize)
    const slots = Array.from({ length: bracketSize }, () => null)

    orderedPlayers.forEach((player, index) => {
      const seedNumber = index + 1
      const slotIndex = seedOrder.indexOf(seedNumber)
      slots[slotIndex] = player.id
    })

    return {
      slotsData: { bracketSize, slots },
      groups: [{ label: 'A', startSlot: 0, slotCount: bracketSize, playerCount: players.length }],
    }
  }

  const groupPlayerCount = Math.ceil(orderedPlayers.length / safeGroupCount)
  const groupSlotCount = getBracketSize(groupPlayerCount)
  const slots = Array.from({ length: groupSlotCount * safeGroupCount }, () => null)
  const groups = []

  for (let groupIndex = 0; groupIndex < safeGroupCount; groupIndex += 1) {
    const groupPlayers = orderedPlayers.slice(groupIndex * groupPlayerCount, (groupIndex + 1) * groupPlayerCount)
    const seedOrder = getSeedOrder(groupSlotCount)
    const startSlot = groupIndex * groupSlotCount
    groups.push({
      label: getGroupLabel(groupIndex),
      startSlot,
      slotCount: groupSlotCount,
      playerCount: groupPlayers.length,
    })
    groupPlayers.forEach((player, index) => {
      const slotIndex = seedOrder.indexOf(index + 1)
      slots[startSlot + slotIndex] = player.id
    })
  }

  return {
    slotsData: { bracketSize: slots.length, slots },
    groups,
  }
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

export function deriveRounds(bracket) {
  const slots = bracket?.slots?.length ? bracket.slots : []
  const results = bracket?.results ?? {}
  const rounds = []
  let currentSlots = slots
  let previousWinners = new Map()
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
      const isBye = (hasPlayerA && slotB === null) || (hasPlayerB && slotA === null)
      const isWaiting = resolvedA.pending || resolvedB.pending
      const isPlayable = hasPlayerA && hasPlayerB && !isWaiting
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
        isWaiting,
        isPlayable,
        result,
      }

      matches.push(match)
      currentWinners.set(id, winnerId)
      nextSlots.push({ fromMatchId: id })
    }

    rounds.push(matches)
    if (nextSlots.length === 1) break
    previousWinners = currentWinners
    currentSlots = nextSlots
    roundIndex += 1
  }

  return rounds
}

export function getChampionId(bracket) {
  const rounds = deriveRounds(bracket)
  const finalRound = rounds[rounds.length - 1]
  return finalRound?.[0]?.winnerId ?? null
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
  }))
}
