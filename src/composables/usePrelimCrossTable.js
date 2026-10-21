// The table follows group roster order; the schedule may store either player first.
export function getPrelimCrossTableCell(playerIds, rowIndex, columnIndex, matches) {
  if (rowIndex >= columnIndex) return null

  const rowPlayerId = playerIds[rowIndex]
  const columnPlayerId = playerIds[columnIndex]
  const match = matches.find(
    (entry) =>
      (entry.playerA === rowPlayerId && entry.playerB === columnPlayerId) ||
      (entry.playerA === columnPlayerId && entry.playerB === rowPlayerId),
  )
  if (!match) return null

  const rowSlot = match.playerA === rowPlayerId ? 0 : 1
  return {
    match,
    rowSlot,
    columnSlot: 1 - rowSlot,
    scoreRow: rowSlot === 0 ? match.result?.scoreA ?? null : match.result?.scoreB ?? null,
    scoreColumn: rowSlot === 0 ? match.result?.scoreB ?? null : match.result?.scoreA ?? null,
  }
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
