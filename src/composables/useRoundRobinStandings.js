export function getRoundRobinStandings(playerIds, matches, players) {
  const playerById = new Map((players ?? []).map((player) => [player.id, player]))
  const rows = new Map(
    (playerIds ?? []).map((playerId) => [
      playerId,
      { playerId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
    ]),
  )

  for (const match of matches ?? []) {
    if (!match.winnerId) continue
    const rowA = rows.get(match.playerA)
    const rowB = rows.get(match.playerB)
    if (!rowA || !rowB) continue

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
  }

  const list = [...rows.values()].map((row) => ({
    ...row,
    diff: row.pointsFor - row.pointsAgainst,
    seed: Number(playerById.get(row.playerId)?.seed) || 0,
  }))
  list.sort(
    (a, b) => b.wins - a.wins || b.diff - a.diff || b.pointsFor - a.pointsFor || a.seed - b.seed,
  )

  // 只有兩人同勝場時，直接對戰結果優先於得失分。
  for (let i = 0; i < list.length - 1; i += 1) {
    const upper = list[i]
    const lower = list[i + 1]
    if (upper.wins !== lower.wins) continue
    if (list.filter((row) => row.wins === upper.wins).length !== 2) continue
    const headToHead = (matches ?? []).find(
      (match) =>
        (match.playerA === upper.playerId && match.playerB === lower.playerId) ||
        (match.playerA === lower.playerId && match.playerB === upper.playerId),
    )
    if (headToHead?.winnerId === lower.playerId) {
      list[i] = lower
      list[i + 1] = upper
    }
  }

  return list.map((row, index) => ({ ...row, rank: index + 1 }))
}
