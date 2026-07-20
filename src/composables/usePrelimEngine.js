import { getGroupLabel, getSeedOrder, shufflePlayers, sortPlayersBySeed } from './useBracketEngine.js'

export const PRELIM_MATCH_PREFIX = 'p'
export const PRELIM_GROUP_SIZE_OPTIONS = [3, 4, 5]

export function normalizePrelimGroupSize(groupSize) {
  const size = Number(groupSize)
  return PRELIM_GROUP_SIZE_OPTIONS.includes(size) ? size : 3
}

export function getPrelimGroupCount(playerCount, groupSize) {
  return Math.max(1, Math.round(playerCount / normalizePrelimGroupSize(groupSize)))
}

export function getPrelimKnockoutSize(groupCount) {
  if (groupCount <= 1) return 2
  const pow = 2 ** Math.ceil(Math.log2(groupCount))
  return pow === groupCount ? groupCount * 2 : pow
}

export function getPrelimGroupSizes(playerCount, groupCount) {
  const base = Math.floor(playerCount / groupCount)
  const extra = playerCount % groupCount
  return Array.from({ length: groupCount }, (_, index) => base + (index < extra ? 1 : 0))
}

export function getPrelimPlan(playerCount, groupSize) {
  const groupCount = getPrelimGroupCount(playerCount, groupSize)
  const groupSizes = getPrelimGroupSizes(playerCount, groupCount)
  const knockoutSize = getPrelimKnockoutSize(groupCount)
  return {
    groupCount,
    groupSizes,
    knockoutSize,
    matchCount: groupSizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0),
    minMatchesPerPlayer: Math.min(...groupSizes) - 1,
    runnerUpCount: knockoutSize - groupCount,
  }
}

export function createPrelimGroups(players, groupSize, pairingMode = 'order') {
  const ordered = pairingMode === 'random' ? shufflePlayers(players) : sortPlayersBySeed(players)
  const groupCount = getPrelimGroupCount(ordered.length, groupSize)
  const sizes = getPrelimGroupSizes(ordered.length, groupCount)
  const groups = sizes.map((capacity, index) => ({ label: getGroupLabel(index), capacity, playerIds: [] }))

  let cursor = 0
  let row = 0
  while (cursor < ordered.length) {
    const open = groups.filter((group) => group.playerIds.length < group.capacity)
    const rowGroups = row % 2 === 0 ? open : [...open].reverse()
    for (const group of rowGroups) {
      if (cursor >= ordered.length) break
      group.playerIds.push(ordered[cursor].id)
      cursor += 1
    }
    row += 1
  }

  return groups.map(({ label, playerIds }) => ({ label, playerIds }))
}

function getRoundRobinPairs(playerIds) {
  const list = [...playerIds]
  if (list.length % 2 === 1) list.push(null)
  const size = list.length
  const pairs = []
  let arr = list
  for (let round = 0; round < size - 1; round += 1) {
    for (let i = 0; i < size / 2; i += 1) {
      const a = arr[i]
      const b = arr[size - 1 - i]
      if (a !== null && b !== null) pairs.push({ round, a, b })
    }
    arr = [arr[0], arr[size - 1], ...arr.slice(1, size - 1)]
  }
  return pairs
}

export function getPrelimMatches(prelim) {
  if (!prelim?.groups?.length) return []
  const matches = []
  prelim.groups.forEach((group, groupIndex) => {
    getRoundRobinPairs(group.playerIds).forEach((pair, matchIndex) => {
      const id = `${PRELIM_MATCH_PREFIX}${groupIndex}-m${matchIndex}`
      const result = prelim.results?.[id] ?? null
      const hasWinner = result && result.winnerSlot !== null && result.winnerSlot !== undefined
      matches.push({
        id,
        groupIndex,
        groupLabel: group.label,
        roundIndex: pair.round,
        matchIndex,
        playerA: pair.a,
        playerB: pair.b,
        winnerId: hasWinner ? (result.winnerSlot === 0 ? pair.a : pair.b) : null,
        result,
        isPlayable: true,
        isBye: false,
        isEmpty: false,
        isWaiting: false,
      })
    })
  })
  return matches
}

export function getPrelimStandings(prelim, players) {
  const matches = getPrelimMatches(prelim)
  const playerById = new Map((players ?? []).map((player) => [player.id, player]))

  return (prelim?.groups ?? []).map((group, groupIndex) => {
    const rows = new Map(
      group.playerIds.map((playerId) => [
        playerId,
        { playerId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
      ]),
    )
    const groupMatches = matches.filter((match) => match.groupIndex === groupIndex)

    groupMatches.forEach((match) => {
      if (!match.winnerId) return
      const rowA = rows.get(match.playerA)
      const rowB = rows.get(match.playerB)
      if (!rowA || !rowB) return
      const scoreA = Number(match.result?.scoreA) || 0
      const scoreB = Number(match.result?.scoreB) || 0
      rowA.played += 1
      rowB.played += 1
      rowA.pointsFor += scoreA
      rowA.pointsAgainst += scoreB
      rowB.pointsFor += scoreB
      rowB.pointsAgainst += scoreA
      if (match.winnerId === match.playerA) {
        rowA.wins += 1
        rowB.losses += 1
      } else {
        rowB.wins += 1
        rowA.losses += 1
      }
    })

    const list = [...rows.values()].map((row) => ({
      ...row,
      diff: row.pointsFor - row.pointsAgainst,
      seed: Number(playerById.get(row.playerId)?.seed) || 0,
    }))
    list.sort(
      (a, b) => b.wins - a.wins || b.diff - a.diff || b.pointsFor - a.pointsFor || a.seed - b.seed,
    )

    // 兩人同勝場時以直接對戰結果優先
    for (let i = 0; i < list.length - 1; i += 1) {
      const upper = list[i]
      const lower = list[i + 1]
      if (upper.wins !== lower.wins) continue
      if (list.filter((row) => row.wins === upper.wins).length !== 2) continue
      const headToHead = groupMatches.find(
        (match) =>
          (match.playerA === upper.playerId && match.playerB === lower.playerId) ||
          (match.playerA === lower.playerId && match.playerB === upper.playerId),
      )
      if (headToHead?.winnerId === lower.playerId) {
        list[i] = lower
        list[i + 1] = upper
      }
    }

    return {
      groupIndex,
      label: group.label,
      rows: list.map((row, index) => ({ ...row, rank: index + 1 })),
    }
  })
}

export function isPrelimComplete(prelim) {
  const matches = getPrelimMatches(prelim)
  return matches.length > 0 && matches.every((match) => match.winnerId)
}

// 不同組人數可能不同，跨組比較一律用場均數據
function compareByRate(a, b) {
  const playedA = a.played || 1
  const playedB = b.played || 1
  return (
    b.wins / playedB - a.wins / playedA ||
    b.diff / playedB - a.diff / playedA ||
    b.pointsFor / playedB - a.pointsFor / playedA ||
    a.seed - b.seed
  )
}

export function getPrelimQualification(prelim, players) {
  const complete = isPrelimComplete(prelim)
  const standings = getPrelimStandings(prelim, players)
  const groupCount = standings.length
  const knockoutSize = getPrelimKnockoutSize(groupCount)
  const runnerUpCount = knockoutSize - groupCount

  const winners = standings
    .filter((group) => group.rows.length)
    .map((group) => ({ ...group.rows[0], groupIndex: group.groupIndex, groupLabel: group.label, groupRank: 1 }))
    .sort(compareByRate)
  const runnerUps = standings
    .filter((group) => group.rows.length > 1)
    .map((group) => ({ ...group.rows[1], groupIndex: group.groupIndex, groupLabel: group.label, groupRank: 2 }))
    .sort(compareByRate)

  return {
    complete,
    knockoutSize,
    runnerUpCount,
    qualifiers: [...winners, ...runnerUps.slice(0, runnerUpCount)],
  }
}

export function createPrelimKnockoutSlots(qualifiers) {
  const size = qualifiers.length
  const slots = getSeedOrder(size).map((rank) => qualifiers[rank - 1])

  // 第一輪盡量避開同組對戰（單一分組時無法避免，直接略過）
  if (new Set(slots.map((entry) => entry.groupIndex)).size > 1) {
    for (let i = 0; i < slots.length; i += 2) {
      if (slots[i].groupIndex !== slots[i + 1].groupIndex) continue
      for (let j = 0; j < slots.length; j += 2) {
        if (j === i) continue
        if (
          slots[i].groupIndex !== slots[j + 1].groupIndex &&
          slots[j].groupIndex !== slots[i + 1].groupIndex
        ) {
          ;[slots[i + 1], slots[j + 1]] = [slots[j + 1], slots[i + 1]]
          break
        }
      }
    }
  }

  return slots.map((entry) => entry.playerId)
}
