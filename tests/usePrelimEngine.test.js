import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPrelimGroups,
  getPrelimMatches,
  getPrelimPlan,
  getPrelimQualification,
  getPrelimStandings,
  isValidCustomPrelimGroupSize,
  normalizePrelimGroupSize,
} from '../src/composables/usePrelimEngine.js'

function createPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, seed: index + 1 }))
}

// 依規格公式獨立計算期望值，不呼叫被測函式
function expectedPlan(playerCount, groupSize) {
  const groupCount = Math.max(1, Math.round(playerCount / groupSize))
  const base = Math.floor(playerCount / groupCount)
  const extra = playerCount % groupCount
  const groupSizes = Array.from({ length: groupCount }, (_, index) => base + (index < extra ? 1 : 0))
  let knockoutSize = 2
  if (groupCount > 1) {
    let pow = 1
    while (pow < groupCount) pow *= 2
    knockoutSize = pow === groupCount ? groupCount * 2 : pow
  }
  return {
    groupCount,
    groupSizes,
    knockoutSize,
    matchCount: groupSizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0),
    minMatchesPerPlayer: Math.min(...groupSizes) - 1,
    runnerUpCount: knockoutSize - groupCount,
  }
}

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

for (const playerCount of [16, 13]) {
  test(`isValidCustomPrelimGroupSize 邊界：${playerCount} 人`, () => {
    const max = Math.floor(playerCount / 2)

    assert.equal(isValidCustomPrelimGroupSize(3, playerCount), true)
    assert.equal(isValidCustomPrelimGroupSize(max, playerCount), true)

    for (const invalid of [2, max + 1, 0, -1, -6, 6.5, NaN, 'abc', '', null, undefined]) {
      assert.equal(isValidCustomPrelimGroupSize(invalid, playerCount), false, `${String(invalid)} 應為不合法`)
    }

    // 實作以 Number() 轉型，數字字串視同數字
    assert.equal(isValidCustomPrelimGroupSize('6', playerCount), true)
    assert.equal(isValidCustomPrelimGroupSize(String(max + 1), playerCount), false)
  })
}

test('normalizePrelimGroupSize：3/4/5 預設值不論人數都保留', () => {
  for (const size of [3, 4, 5]) {
    for (const playerCount of [3, 4, 5, 6, 8, 9, 16, 100]) {
      assert.equal(normalizePrelimGroupSize(size, playerCount), size, `${playerCount} 人選 ${size}`)
    }
  }
  assert.equal(normalizePrelimGroupSize(5, 6), 5)
  assert.equal(normalizePrelimGroupSize(5, 8), 5)
  assert.equal(normalizePrelimGroupSize(4, 4), 4)
})

test('normalizePrelimGroupSize：合法自訂值保留、不合法回 3', () => {
  assert.equal(normalizePrelimGroupSize(6, 16), 6)
  assert.equal(normalizePrelimGroupSize(8, 16), 8)
  assert.equal(normalizePrelimGroupSize(6, 13), 6)
  assert.equal(normalizePrelimGroupSize(10, 20), 10)

  assert.equal(normalizePrelimGroupSize(9, 16), 3)
  assert.equal(normalizePrelimGroupSize(7, 13), 3)
  assert.equal(normalizePrelimGroupSize(6, 11), 3)
  for (const invalid of [2, 0, -4, 6.5, NaN, 'abc', '', null, undefined]) {
    assert.equal(normalizePrelimGroupSize(invalid, 16), 3, `${String(invalid)} 應回 3`)
  }
  // 數字字串會被轉成數字回傳
  assert.equal(normalizePrelimGroupSize('6', 16), 6)
})

test('normalizePrelimGroupSize：未傳 playerCount 時上限視為 Infinity', () => {
  assert.equal(normalizePrelimGroupSize(3), 3)
  assert.equal(normalizePrelimGroupSize(6), 6)
  assert.equal(normalizePrelimGroupSize(100), 100)
  assert.equal(normalizePrelimGroupSize('7'), 7)
  assert.equal(normalizePrelimGroupSize(2), 3)
  assert.equal(normalizePrelimGroupSize(6.5), 3)
  assert.equal(normalizePrelimGroupSize(Infinity), 3)
  assert.equal(normalizePrelimGroupSize(undefined), 3)
  assert.equal(normalizePrelimGroupSize('abc'), 3)
})

test('getPrelimPlan 3/4/5 回歸：依規格公式獨立計算比對', () => {
  for (const playerCount of [6, 8, 12, 16, 20]) {
    for (const size of [3, 4, 5]) {
      assert.deepEqual(getPrelimPlan(playerCount, size), expectedPlan(playerCount, size), `${playerCount} 人選 ${size}`)
    }
  }
})

test('getPrelimPlan 3/4/5 回歸：6 人選 5 為 1 組 6 人、8 人選 5 為 2 組', () => {
  assert.deepEqual(getPrelimPlan(6, 5), {
    groupCount: 1,
    groupSizes: [6],
    knockoutSize: 2,
    matchCount: 15,
    minMatchesPerPlayer: 5,
    runnerUpCount: 1,
  })
  assert.deepEqual(getPrelimPlan(8, 5), {
    groupCount: 2,
    groupSizes: [4, 4],
    knockoutSize: 4,
    matchCount: 12,
    minMatchesPerPlayer: 3,
    runnerUpCount: 2,
  })
})

const customPlanCases = [
  {
    playerCount: 20,
    size: 7,
    plan: { groupCount: 3, groupSizes: [7, 7, 6], knockoutSize: 4, matchCount: 57, minMatchesPerPlayer: 5, runnerUpCount: 1 },
  },
  {
    playerCount: 20,
    size: 10,
    plan: { groupCount: 2, groupSizes: [10, 10], knockoutSize: 4, matchCount: 90, minMatchesPerPlayer: 9, runnerUpCount: 2 },
  },
  {
    playerCount: 30,
    size: 6,
    plan: { groupCount: 5, groupSizes: [6, 6, 6, 6, 6], knockoutSize: 8, matchCount: 75, minMatchesPerPlayer: 5, runnerUpCount: 3 },
  },
  {
    playerCount: 16,
    size: 6,
    plan: { groupCount: 3, groupSizes: [6, 5, 5], knockoutSize: 4, matchCount: 35, minMatchesPerPlayer: 4, runnerUpCount: 1 },
  },
]

for (const { playerCount, size, plan } of customPlanCases) {
  test(`摘要數字：${playerCount} 人自訂每組 ${size} 人`, () => {
    assert.deepEqual(getPrelimPlan(playerCount, size), plan)
    assert.deepEqual(getPrelimPlan(playerCount, size), expectedPlan(playerCount, size))
  })

  test(`createPrelimGroups：${playerCount} 人自訂每組 ${size} 人分組與 plan 一致且每位選手剛好一次`, () => {
    const players = createPlayers(playerCount)
    for (const mode of ['order', 'random']) {
      const groups = createPrelimGroups(players, size, mode)
      assert.deepEqual(
        groups.map((group) => group.playerIds.length),
        plan.groupSizes,
        `${mode} 模式每組人數`,
      )
      const allIds = groups.flatMap((group) => group.playerIds)
      assert.equal(allIds.length, playerCount)
      assert.deepEqual([...allIds].sort(), players.map((player) => player.id).sort())
    }
  })

  test(`晉級規則：${playerCount} 人自訂每組 ${size} 人，晉級數 = 淘汰賽規模`, () => {
    const players = createPlayers(playerCount)
    const seedById = new Map(players.map((player) => [player.id, player.seed]))
    const prelim = { groupSize: size, groups: createPrelimGroups(players, size), results: {} }

    // 每場都由編號較小者 2:0 獲勝
    getPrelimMatches(prelim).forEach((match) => {
      const aWins = seedById.get(match.playerA) < seedById.get(match.playerB)
      prelim.results[match.id] = { winnerSlot: aWins ? 0 : 1, scoreA: aWins ? 2 : 0, scoreB: aWins ? 0 : 2 }
    })

    const qualification = getPrelimQualification(prelim, players)
    assert.equal(qualification.complete, true)
    assert.equal(qualification.knockoutSize, plan.knockoutSize)
    assert.equal(qualification.runnerUpCount, plan.runnerUpCount)
    assert.equal(qualification.qualifiers.length, plan.knockoutSize)

    const idsBySeed = prelim.groups.map((group) =>
      [...group.playerIds].sort((a, b) => seedById.get(a) - seedById.get(b)),
    )
    const winners = qualification.qualifiers.filter((entry) => entry.groupRank === 1)
    const runnerUps = qualification.qualifiers.filter((entry) => entry.groupRank === 2)

    assert.equal(winners.length, plan.groupCount)
    assert.deepEqual(
      winners.map((entry) => entry.playerId).sort(),
      idsBySeed.map((ids) => ids[0]).sort(),
    )
    assert.equal(runnerUps.length, plan.runnerUpCount)
    runnerUps.forEach((entry) => {
      assert.equal(entry.playerId, idsBySeed[entry.groupIndex][1])
    })
    assert.equal(new Set(runnerUps.map((entry) => entry.groupIndex)).size, runnerUps.length)
    assert.equal(new Set(qualification.qualifiers.map((entry) => entry.playerId)).size, plan.knockoutSize)
  })
}
