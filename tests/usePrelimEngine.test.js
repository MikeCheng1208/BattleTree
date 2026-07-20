import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrelimMatches, getPrelimStandings } from '../src/composables/usePrelimEngine.js'

test('既有預賽循環排名在共用排名引擎後維持一致', () => {
  const players = [
    { id: 'a', seed: 1 },
    { id: 'b', seed: 2 },
    { id: 'c', seed: 3 },
  ]
  const prelim = {
    groups: [{ label: 'A', playerIds: ['a', 'b', 'c'] }],
    results: {},
  }
  const matches = getPrelimMatches(prelim)
  matches.forEach((match) => {
    const winnerId = match.id === 'p0-m1' ? 'a' : 'b'
    prelim.results[match.id] = {
      winnerSlot: match.playerA === winnerId ? 0 : 1,
      scoreA: match.playerA === winnerId ? 2 : 0,
      scoreB: match.playerB === winnerId ? 2 : 0,
    }
  })

  assert.deepEqual(
    getPrelimStandings(prelim, players)[0].rows.map((row) => [row.playerId, row.wins]),
    [
      ['b', 2],
      ['a', 1],
      ['c', 0],
    ],
  )
})
