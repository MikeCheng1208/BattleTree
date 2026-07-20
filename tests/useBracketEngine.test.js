import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createFreeSlots,
  deriveRounds,
  FREE_SLOT_COUNT_OPTIONS,
  getFinalThreeMatches,
  getFinalThreeStandings,
  getFreeSeedOrder,
  getPodium,
  isFinalThreeComplete,
  sanitizeResults,
} from '../src/composables/useBracketEngine.js'

function createPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    displayName: `Player ${index + 1}`,
    seed: index + 1,
  }))
}

function createFinalThreeBracket(size) {
  const players = createPlayers(size)
  return {
    format: 'free',
    freeSlotCount: size,
    players,
    slots: createFreeSlots(players, 'order', size).slots,
    results: {},
    byeSlots: [],
  }
}

function finishElimination(bracket) {
  for (let pass = 0; pass < 8; pass += 1) {
    const playable = deriveRounds(bracket).flat().filter((match) => match.isPlayable && !match.winnerId)
    if (!playable.length) break
    playable.forEach((match) => {
      bracket.results[match.id] = { winnerSlot: 0, scoreA: 1, scoreB: 0 }
    })
  }
}

test('自由編排提供 24 與 48 格選項', () => {
  assert.deepEqual(FREE_SLOT_COUNT_OPTIONS, [8, 16, 24, 32, 48, 64])
})

for (const [size, expectedRounds] of [
  [24, [12, 6, 3]],
  [48, [24, 12, 6, 3]],
]) {
  test(`${size} 格分成三條平衡淘汰分支並停在三強`, () => {
    const seedOrder = getFreeSeedOrder(size)
    const branchSize = size / 3
    assert.equal(seedOrder.length, size)
    assert.equal(new Set(seedOrder).size, size)
    assert.ok(seedOrder.slice(0, branchSize).includes(1))
    assert.ok(seedOrder.slice(branchSize, branchSize * 2).includes(2))
    assert.ok(seedOrder.slice(branchSize * 2).includes(3))

    const bracket = createFinalThreeBracket(size)
    assert.deepEqual(deriveRounds(bracket).map((round) => round.length), expectedRounds)
    assert.equal(getFinalThreeMatches(bracket).length, 3)
  })
}

test('三強循環完成後依勝場與比分產生前三名', () => {
  const bracket = createFinalThreeBracket(24)
  finishElimination(bracket)
  const matches = getFinalThreeMatches(bracket)
  const finalistIds = [...new Set(matches.flatMap((match) => [match.playerA, match.playerB]))]
  assert.deepEqual(finalistIds, ['p1', 'p2', 'p3'])

  bracket.results[matches[0].id] = { winnerSlot: 0, scoreA: 3, scoreB: 1 }
  bracket.results[matches[1].id] = { winnerSlot: 0, scoreA: 2, scoreB: 1 }
  bracket.results[matches[2].id] = { winnerSlot: 1, scoreA: 0, scoreB: 3 }

  assert.equal(isFinalThreeComplete(bracket), true)
  assert.deepEqual(
    getFinalThreeStandings(bracket).map((row) => [row.playerId, row.wins]),
    [
      ['p1', 2],
      ['p2', 1],
      ['p3', 0],
    ],
  )
  assert.deepEqual(getPodium(bracket), {
    championId: 'p1',
    runnerUpId: 'p2',
    thirdPlaceId: 'p3',
    fourthPlaceId: null,
    thirdPlaceMatch: null,
    isFinalThree: true,
  })
  assert.equal(Object.keys(sanitizeResults(bracket)).length, 24)
})

test('三人各一勝時必須補齊比分才完成排名', () => {
  const bracket = createFinalThreeBracket(24)
  finishElimination(bracket)
  const matches = getFinalThreeMatches(bracket)
  bracket.results[matches[0].id] = { winnerSlot: 0, scoreA: null, scoreB: null }
  bracket.results[matches[1].id] = { winnerSlot: 0, scoreA: null, scoreB: null }
  bracket.results[matches[2].id] = { winnerSlot: 0, scoreA: null, scoreB: null }
  assert.equal(isFinalThreeComplete(bracket), false)

  matches.forEach((match) => {
    bracket.results[match.id] = { winnerSlot: 0, scoreA: 2, scoreB: 0 }
  })
  assert.equal(isFinalThreeComplete(bracket), true)
})
