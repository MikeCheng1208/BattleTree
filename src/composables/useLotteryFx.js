import { nextTick, onBeforeUnmount, unref, watch } from 'vue'
import { gsap } from 'gsap'

export function useLotteryFx({ drawPhase, stageEl, flyCardEls }) {
  function getCards() {
    return (unref(flyCardEls) ?? []).filter(Boolean)
  }

  function getStageCenter() {
    const stage = unref(stageEl)
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }

  function killCards() {
    gsap.killTweensOf(getCards())
  }

  watch(drawPhase, async (phase) => {
    if (phase === 'burst') {
      await nextTick()
      const cards = getCards()
      const center = getStageCenter()
      if (!cards.length || !center) return
      gsap.killTweensOf(cards)
      cards.forEach((card) => {
        gsap.fromTo(
          card,
          {
            x: center.x,
            y: center.y,
            xPercent: -50,
            yPercent: -50,
            rotation: 0,
            scale: 0.3,
            opacity: 0,
          },
          {
            x: gsap.utils.random(48, window.innerWidth - 48),
            y: gsap.utils.random(48, window.innerHeight - 48),
            rotation: gsap.utils.random(-540, 540),
            scale: gsap.utils.random(0.85, 1.15),
            opacity: 1,
            duration: 0.9,
            delay: gsap.utils.random(0, 0.35),
            ease: 'power2.out',
          },
        )
      })
    } else if (phase === 'swirl') {
      getCards().forEach((card) => {
        gsap.to(card, {
          x: `+=${gsap.utils.random(-90, 90)}`,
          y: `+=${gsap.utils.random(-70, 70)}`,
          rotation: `+=${gsap.utils.random(-60, 60)}`,
          duration: gsap.utils.random(0.8, 1.4),
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        })
      })
    } else if (phase === 'converge') {
      const cards = getCards()
      const center = getStageCenter()
      if (!cards.length || !center) return
      gsap.killTweensOf(cards)
      gsap.to(cards, {
        x: center.x,
        y: center.y,
        rotation: 0,
        scale: 0.35,
        opacity: 0,
        duration: 1.1,
        ease: 'power3.in',
        stagger: 0.04,
      })
    } else if (phase === 'idle' || phase === 'settled') {
      killCards()
    }
  })

  onBeforeUnmount(() => {
    killCards()
  })
}
