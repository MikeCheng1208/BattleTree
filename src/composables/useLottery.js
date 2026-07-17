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
  const drawPhase = ref('idle')
  const countdown = ref(null)
  const flyingCards = ref([])
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

  function stopDraw() {
    timeline?.kill()
    timeline = null
    isRolling.value = false
    drawPhase.value = 'idle'
    countdown.value = null
    flyingCards.value = []
  }

  function resetPool() {
    stopDraw()
    updateLottery({
      confirmed: false,
      excludedIds: [],
      pool: [],
      drawn: [],
    })
    currentHighlightId.value = null
    winnerId.value = null
  }

  function buildFlyingCards(pool) {
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const count = shuffled.length >= 10 ? Math.min(14, shuffled.length) : 10
    return Array.from({ length: count }, (_, index) => {
      const id = shuffled[index % shuffled.length]
      const player = playerMap.value[id]
      return {
        key: `${id}-${index}`,
        seed: player?.seed ?? '',
        name: player?.displayName ?? player?.name ?? '',
      }
    })
  }

  async function drawOne() {
    const bracket = unref(bracketRef)
    const pool = bracket?.lottery?.pool ?? []
    if (!pool.length || isRolling.value) return

    stopDraw()

    const pickedIndex = Math.floor(Math.random() * pool.length)
    const pickedId = pool[pickedIndex]
    const progress = { value: 0 }
    const syncHighlight = () => {
      currentHighlightId.value = pool[Math.floor(progress.value) % pool.length]
    }
    const commitDraw = () => {
      currentHighlightId.value = pickedId
      winnerId.value = pickedId
      updateLottery({
        pool: pool.filter((id) => id !== pickedId),
        drawn: [...(bracket.lottery.drawn ?? []), pickedId],
      })
    }

    winnerId.value = null
    isRolling.value = true

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      const steps = Math.max(16, pool.length * 2)
      const target = steps + ((pickedIndex - (steps % pool.length) + pool.length) % pool.length)
      await new Promise((resolve) => {
        timeline = gsap.timeline({ onComplete: resolve })
        timeline.call(() => {
          drawPhase.value = 'converge'
        })
        timeline.to(progress, {
          value: target,
          duration: 1.8,
          ease: 'power3.out',
          onUpdate: syncHighlight,
        })
        timeline.call(() => {
          drawPhase.value = 'reveal'
          commitDraw()
        })
        timeline.to({}, { duration: 0.4 })
      })
      drawPhase.value = 'settled'
      isRolling.value = false
      return
    }

    // 假停頓：先減速停在 decoy，再逐格「咚咚」跳到真命卡，製造懸念
    const decoySteps = pool.length >= 3 ? 1 + Math.floor(Math.random() * 2) : pool.length === 2 ? 1 : 0
    const decoyIndex = (pickedIndex - decoySteps + pool.length) % pool.length
    const steps = Math.max(40, pool.length * 6)
    const decoyTarget = steps + ((decoyIndex - (steps % pool.length) + pool.length) % pool.length)
    const crawl = Math.min(10, Math.floor(steps * 0.2))
    const fastEnd = decoyTarget - crawl

    flyingCards.value = buildFlyingCards(pool)

    await new Promise((resolve) => {
      timeline = gsap.timeline({ onComplete: resolve })
      timeline.call(() => {
        drawPhase.value = 'burst'
      })
      timeline.to(progress, {
        value: fastEnd * 0.18,
        duration: 0.9,
        ease: 'power2.in',
        onUpdate: syncHighlight,
      })
      timeline.call(() => {
        drawPhase.value = 'swirl'
      })
      timeline.to(progress, {
        value: fastEnd,
        duration: 2.1,
        ease: 'none',
        onUpdate: syncHighlight,
      })
      timeline.call(() => {
        drawPhase.value = 'converge'
      })
      timeline.to(progress, {
        value: decoyTarget,
        duration: 1.4,
        ease: 'power3.out',
        onUpdate: syncHighlight,
      })
      timeline.call(
        () => {
          countdown.value = 3
        },
        null,
        3.1,
      )
      timeline.call(
        () => {
          countdown.value = 2
        },
        null,
        3.9,
      )
      timeline.call(() => {
        drawPhase.value = 'suspense'
        countdown.value = 1
      })
      timeline.to({}, { duration: 0.35 })
      for (let hop = 1; hop <= decoySteps; hop += 1) {
        const hopId = pool[(decoyIndex + hop) % pool.length]
        timeline.call(
          () => {
            currentHighlightId.value = hopId
          },
          null,
          '+=0.18',
        )
      }
      timeline.call(
        () => {
          drawPhase.value = 'reveal'
          countdown.value = null
          commitDraw()
        },
        null,
        '+=0.27',
      )
      timeline.to({}, { duration: 1.5 })
    })

    drawPhase.value = 'settled'
    isRolling.value = false
    flyingCards.value = []
  }

  onBeforeUnmount(() => {
    stopDraw()
  })

  return {
    currentHighlightId,
    winnerId,
    isRolling,
    drawPhase,
    countdown,
    flyingCards,
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
