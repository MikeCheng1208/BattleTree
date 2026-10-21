import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPrelimGroups,
  getPrelimMatches,
  getPrelimPlan,
  getPrelimStandings,
  isValidCustomPrelimGroupSize,
  normalizePrelimGroupSize,
} from '../src/composables/usePrelimEngine.js'

test('合法自訂每組人數沿用四捨五入與平均分組算法', () => {
  const players = Array.from({ length: 16 }, (_, index) => ({ id: `p${index + 1}`, seed: index + 1 }))

  assert.equal(isValidCustomPrelimGroupSize(6, players.length), true)
  assert.equal(normalizePrelimGroupSize(6, players.length), 6)
  assert.deepEqual(getPrelimPlan(players.length, 6), {
    groupCount: 3,
    groupSizes: [6, 5, 5],
    knockoutSize: 4,
    matchCount: 35,
    minMatchesPerPlayer: 4,
    runnerUpCount: 1,
  })
  assert.deepEqual(createPrelimGroups(players, 6).map((group) => group.playerIds.length), [6, 5, 5])
  assert.equal(normalizePrelimGroupSize(8, players.length), 8)
})

test('自訂每組人數超出 3 至總人數一半時不套用', () => {
  assert.equal(isValidCustomPrelimGroupSize(2, 16), false)
  assert.equal(isValidCustomPrelimGroupSize(9, 16), false)
  assert.equal(isValidCustomPrelimGroupSize(6.5, 16), false)
  assert.equal(normalizePrelimGroupSize(2, 16), 3)
  assert.equal(normalizePrelimGroupSize(9, 16), 3)
  assert.deepEqual(getPrelimPlan(16, 9).groupSizes, getPrelimPlan(16, 3).groupSizes)
  assert.equal(normalizePrelimGroupSize(5, 8), 5)
})

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
