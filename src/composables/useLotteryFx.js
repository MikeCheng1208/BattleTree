import { nextTick, onBeforeUnmount, unref, watch } from 'vue'
import { gsap } from 'gsap'

export function useLotteryFx({ drawPhase, stageEl, flyCardEls }) {
  let vortexCards = []
  let vortexCenter = null
  let vortexBounds = null
  let vortexTime = 0
  const vortexSpeed = { value: 0 }

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

  // 以整個視窗為舞台的橢圓軌道範圍，讓卡片能鋪滿畫面
  function getOrbitBounds() {
    return {
      cx: window.innerWidth / 2,
      cy: window.innerHeight / 2,
      rx: window.innerWidth * 0.44,
      ry: window.innerHeight * 0.4,
    }
  }

  function updateVortex(_, deltaTime) {
    if (!vortexCards.length || !vortexCenter || !vortexBounds) return
    const dt = Math.min(deltaTime, 100) / 1000
    vortexTime += dt
    vortexCards.forEach((state) => {
      // 陣風：公轉速度忽快忽慢，像被一波波風推著走
      const gust = 1 + Math.sin(vortexTime * state.gustFreq + state.wobblePhase) * 0.32
      state.angle += vortexSpeed.value * state.speedScale * gust * dt
      state.spin += state.spinSpeed * dt
      const wobble = 1 + Math.sin(vortexTime * state.wobbleFreq + state.wobblePhase) * 0.1
      const breathe = 1 + Math.sin(vortexTime * state.wobbleFreq * 0.7 + state.wobblePhase) * 0.07
      const factor = state.factor * wobble
      // depth: 0 = 軌道後方（遠），1 = 軌道前方（近），做出 3D 旋轉木馬般的景深
      const depth = (Math.sin(state.angle) + 1) / 2
      const pull = state.pull
      const calm = 1 - pull
      // 上下拋甩：卡片被氣流托起又摔落
      const bob = Math.sin(vortexTime * state.bobFreq + state.wobblePhase) * state.bobAmp * calm
      const x = vortexCenter.x + Math.cos(state.angle) * vortexBounds.rx * factor
      const y = vortexCenter.y + Math.sin(state.angle) * vortexBounds.ry * factor + bob
      const scale = state.baseScale * (0.5 + 0.75 * depth) * breathe
      // 翻滾與紙片顫動：自轉持續累積，加上高頻小幅度的擺動
      const flutter = Math.sin(vortexTime * state.flutterFreq + state.wobblePhase) * state.flutterAmp
      const baseDeg =
        (Math.cos(state.angle) * -14 + state.tilt * 0.4 + state.spin + flutter) * calm
      let rotation = baseDeg
      if (pull > 0) {
        // pull: 吸入時卡片轉向漩渦中心，沿吸入方向被拉長、垂直方向壓扁（拉扯感）
        const radialDeg = (Math.atan2(y - vortexCenter.y, x - vortexCenter.x) * 180) / Math.PI
        const delta = ((radialDeg - baseDeg + 540) % 360) - 180
        rotation = baseDeg + delta * pull
      }
      gsap.set(state.el, {
        x,
        y,
        xPercent: -50,
        yPercent: -50,
        rotation,
        rotationY:
          (Math.cos(state.angle) * 46 + Math.sin(vortexTime * state.flutterFreq * 0.8 + state.wobblePhase) * 20) *
          calm,
        rotationX: Math.sin(vortexTime * state.flutterFreq * 1.15 + state.wobblePhase * 2) * 16 * calm,
        transformPerspective: 900,
        scaleX: scale * (1 + pull * 2.1),
        scaleY: scale * (1 - pull * 0.58),
        zIndex: 100 + Math.round(depth * 200),
        opacity: state.fade * (0.5 + 0.5 * depth),
      })
    })
  }

  function startVortex() {
    const cards = getCards()
    vortexBounds = getOrbitBounds()
    vortexCenter = { x: vortexBounds.cx, y: vortexBounds.cy }
    vortexTime = 0
    vortexCards = cards.map((el) => {
      const rect = el.getBoundingClientRect()
      const dx = rect.left + rect.width / 2 - vortexCenter.x
      const dy = rect.top + rect.height / 2 - vortexCenter.y
      return {
        el,
        angle: Math.atan2(dy / vortexBounds.ry, dx / vortexBounds.rx),
        factor: gsap.utils.clamp(
          0.24,
          1.02,
          Math.hypot(dx / vortexBounds.rx, dy / vortexBounds.ry),
        ),
        speedScale: gsap.utils.random(0.82, 1.35),
        wobbleFreq: gsap.utils.random(1.6, 3.2),
        wobblePhase: gsap.utils.random(0, Math.PI * 2),
        tilt: gsap.utils.random(-14, 14),
        baseScale: Number(gsap.getProperty(el, 'scaleX')) || 1,
        fade: 1,
        pull: 0,
        spin: 0,
        spinSpeed: gsap.utils.random(0, 1) < 0.5 ? gsap.utils.random(-150, -50) : gsap.utils.random(50, 150),
        flutterFreq: gsap.utils.random(2.2, 4.0),
        flutterAmp: gsap.utils.random(14, 30),
        bobFreq: gsap.utils.random(1.3, 2.4),
        bobAmp: gsap.utils.random(18, 46),
        gustFreq: gsap.utils.random(0.7, 1.5),
      }
    })
    vortexSpeed.value = 0.9
    gsap.killTweensOf(vortexSpeed)
    gsap.to(vortexSpeed, { value: 4.6, duration: 1.7, ease: 'power2.in' })
    gsap.ticker.add(updateVortex)
  }

  function stopVortex() {
    gsap.ticker.remove(updateVortex)
    gsap.killTweensOf(vortexSpeed)
    gsap.killTweensOf(vortexCards)
    if (vortexCenter) gsap.killTweensOf(vortexCenter)
    vortexCards = []
  }

  function killCards() {
    stopVortex()
    gsap.killTweensOf(getCards())
  }

  watch(drawPhase, async (phase) => {
    if (phase === 'burst') {
      await nextTick()
      const cards = getCards()
      const center = getStageCenter()
      if (!cards.length || !center) return
      gsap.killTweensOf(cards)
      const bounds = getOrbitBounds()
      // 由內到外均勻分層再打亂，讓卡片鋪滿整個畫面而不是擠在中間
      const factors = gsap.utils.shuffle(
        cards.map((_, index) => 0.3 + 0.72 * ((index + 0.5) / cards.length)),
      )
      cards.forEach((card, index) => {
        const angle = (index / cards.length) * Math.PI * 2 + gsap.utils.random(-0.4, 0.4)
        const factor = factors[index] * gsap.utils.random(0.96, 1.04)
        const baseScale = gsap.utils.random(0.55, 1.75)
        gsap.set(card, { zIndex: Math.round(baseScale * 100) })
        gsap.fromTo(
          card,
          {
            x: center.x,
            y: center.y,
            xPercent: -50,
            yPercent: -50,
            rotation: gsap.utils.random(-30, 30),
            scale: 0.3,
            opacity: 0,
          },
          {
            x: bounds.cx + Math.cos(angle) * bounds.rx * factor,
            y: bounds.cy + Math.sin(angle) * bounds.ry * factor,
            rotation: Math.cos(angle) * -14,
            rotationY: Math.cos(angle) * 46,
            transformPerspective: 900,
            scale: baseScale,
            opacity: 1,
            duration: 0.75,
            delay: gsap.utils.random(0, 0.3),
            ease: 'power3.out',
          },
        )
      })
    } else if (phase === 'swirl') {
      const cards = getCards()
      if (!cards.length) return
      gsap.killTweensOf(cards)
      startVortex()
    } else if (phase === 'converge') {
      const cards = getCards()
      const center = getStageCenter()
      if (!cards.length || !center) return
      if (vortexCards.length) {
        // 漩渦吸入：軌道收斂回舞台中心、轉速再拉高，卡片被拉扯著轉進中心
        // 時長對齊倒數節奏：從吸入開始到開牌（約 2.5 秒）最後一張卡才收完
        gsap.killTweensOf(vortexSpeed)
        gsap.to(vortexSpeed, { value: 9, duration: 2.0, ease: 'power2.in' })
        gsap.to(vortexCenter, { x: center.x, y: center.y, duration: 1.6, ease: 'power2.inOut' })
        gsap.to(vortexCards, {
          factor: 0.02,
          baseScale: 0.3,
          pull: 1,
          duration: 2.2,
          ease: 'power3.in',
          stagger: 0.012,
        })
        gsap.to(vortexCards, {
          fade: 0,
          duration: 2.2,
          ease: 'power4.in',
          stagger: 0.012,
          onComplete: stopVortex,
        })
      } else {
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
      }
    } else if (phase === 'idle' || phase === 'settled') {
      killCards()
    }
  })

  onBeforeUnmount(() => {
    killCards()
  })
}
