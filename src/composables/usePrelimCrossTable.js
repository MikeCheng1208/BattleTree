function isSamePair(match, firstPlayerId, secondPlayerId) {
  return (
    (match.playerA === firstPlayerId && match.playerB === secondPlayerId) ||
    (match.playerA === secondPlayerId && match.playerB === firstPlayerId)
  )
}

function buildPrelimCrossTableCell(match, rowPlayerId) {
  const rowSlot = match.playerA === rowPlayerId ? 0 : 1
  const winnerSlot = match.result?.winnerSlot
  return {
    match,
    rowSlot,
    columnSlot: 1 - rowSlot,
    scoreRow: rowSlot === 0 ? match.result?.scoreA ?? null : match.result?.scoreB ?? null,
    scoreColumn: rowSlot === 0 ? match.result?.scoreB ?? null : match.result?.scoreA ?? null,
    // 對戰卡可以只點勝方不填比分，交叉表仍要能從列選手角度顯示勝敗
    rowOutcome: winnerSlot === 0 || winnerSlot === 1 ? (winnerSlot === rowSlot ? 'win' : 'loss') : null,
  }
}

// The table follows group roster order; the schedule may store either player first.
export function getPrelimCrossTableCell(playerIds, rowIndex, columnIndex, matches) {
  if (rowIndex >= columnIndex) return null

  const rowPlayerId = playerIds[rowIndex]
  const columnPlayerId = playerIds[columnIndex]
  const match = matches.find((entry) => isSamePair(entry, rowPlayerId, columnPlayerId))
  if (!match) return null

  return buildPrelimCrossTableCell(match, rowPlayerId)
}

// 重新分組後比賽 id 會沿用（p0-m0…），只比對 id 會把比分寫到已換人的比賽，所以也要確認兩位選手沒變
export function getPrelimCrossTableSelectionCell(selected, matches) {
  if (!selected?.match) return null
  const match = matches.find((entry) => entry.id === selected.match.id)
  if (!match || !isSamePair(match, selected.rowPlayerId, selected.columnPlayerId)) return null
  return buildPrelimCrossTableCell(match, selected.rowPlayerId)
}

export function isPrelimCrossTableSelectionCurrent(selected, matches) {
  return getPrelimCrossTableSelectionCell(selected, matches) !== null
}

export function getPrelimMatchResultFromCell(cell, scoreRow, scoreColumn, tieWinnerSlot = null) {
  const winnerSlot = scoreRow === scoreColumn
    ? tieWinnerSlot
    : (scoreRow > scoreColumn ? cell.rowSlot : cell.columnSlot)
  return {
    winnerSlot,
    scoreA: cell.rowSlot === 0 ? scoreRow : scoreColumn,
    scoreB: cell.rowSlot === 0 ? scoreColumn : scoreRow,
  }
}
