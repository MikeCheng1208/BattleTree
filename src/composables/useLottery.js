import { computed, onBeforeUnmount, ref, unref } from 'vue'
import { gsap } from 'gsap'
import { getLosersByRound, getPlayerMap, getRoundLabels } from './useBracketEngine'

function parseRoundFilter(filter) {
  const match = /^loser-r(\d+)$/.exec(filter)
  return match ? Number(match[1]) : null
}

export function useLottery(bracketRef, updateLottery) {
  const currentHighlightId = ref(null)
  const winnerId = ref(null)
  const isRolling = ref(false)
  let timeline = null

  const playerMap = computed(() => getPlayerMap(unref(bracketRef)?.players ?? []))

  const filterOptions = computed(() => [
    { value: 'all', label: '全部' },
    ...getRoundLabels(unref(bracketRef) ?? {}),
  ])

  function getPoolByFilter(filter) {
    const bracket = unref(bracketRef)
    if (!bracket) return []
    if (filter === 'all') return bracket.players.map((player) => player.id)
    const roundIndex = parseRoundFilter(filter)
    return roundIndex === null ? [] : getLosersByRound(bracket, roundIndex)
  }

  const candidatePool = computed(() => getPoolByFilter(unref(bracketRef)?.lottery?.poolFilter ?? 'all'))
  const excludedIds = computed(() => new Set(unref(bracketRef)?.lottery?.excludedIds ?? []))
  const previewPool = computed(() => candidatePool.value.filter((id) => !excludedIds.value.has(id)))

  function setFilter(poolFilter) {
    updateLottery({
      poolFilter,
      confirmed: false,
      excludedIds: [],
      pool: [],
      drawn: [],
    })
  }

  function toggleCandidate(playerId) {
    const bracket = unref(bracketRef)
    if (!bracket || bracket.lottery?.confirmed) return
    const excluded = new Set(bracket.lottery?.excludedIds ?? [])
    if (excluded.has(playerId)) {
      excluded.delete(playerId)
    } else {
      excluded.add(playerId)
    }
    updateLottery({
      excludedIds: [...excluded],
    })
  }

  function confirmPool() {
    updateLottery({
      confirmed: true,
      pool: previewPool.value,
      drawn: [],
    })
  }

  function resetPool() {
    updateLottery({
      confirmed: false,
      excludedIds: [],
      pool: [],
      drawn: [],
    })
    currentHighlightId.value = null
    winnerId.value = null
  }

  async function drawOne() {
    const bracket = unref(bracketRef)
    const pool = bracket?.lottery?.pool ?? []
    if (!pool.length || isRolling.value) return

    const pickedIndex = Math.floor(Math.random() * pool.length)
    const pickedId = pool[pickedIndex]
    const cycles = Math.max(24, pool.length * 5)
    const landingOffset = (pickedIndex - (cycles % pool.length) + pool.length) % pool.length
    const progress = { value: 0 }

    winnerId.value = null
    isRolling.value = true
    timeline?.kill()

    await new Promise((resolve) => {
      timeline = gsap.timeline({
        onComplete: resolve,
      })
      timeline.to(progress, {
        value: cycles + landingOffset,
        duration: 2.8,
        ease: 'power4.out',
        onUpdate: () => {
          const index = Math.floor(progress.value) % pool.length
          currentHighlightId.value = pool[index]
        },
      })
      timeline.to(
        progress,
        {
          value: cycles + landingOffset + pool.length,
          duration: 0.7,
          ease: 'back.out(1.7)',
          onStart: () => {
            currentHighlightId.value = pickedId
          },
        },
        '>-0.05',
      )
    })

    winnerId.value = pickedId
    isRolling.value = false
    updateLottery({
      pool: pool.filter((id) => id !== pickedId),
      drawn: [...(bracket.lottery.drawn ?? []), pickedId],
    })
  }

  onBeforeUnmount(() => {
    timeline?.kill()
  })

  return {
    currentHighlightId,
    winnerId,
    isRolling,
    playerMap,
    filterOptions,
    candidatePool,
    previewPool,
    excludedIds,
    setFilter,
    toggleCandidate,
    confirmPool,
    resetPool,
    drawOne,
  }
}
