import { computed, nextTick, ref } from 'vue'
import { gsap } from 'gsap'

const MIN_SCALE = 0.08
const MAX_SCALE = 2
const STEP = 0.1

function clamp(value, min = MIN_SCALE, max = MAX_SCALE) {
  return Math.min(max, Math.max(min, value))
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, input, textarea, select, a, [role="button"]'))
}

export function usePanZoom(viewportRef, contentRef, boardRef) {
  const scale = ref(1)
  const translateX = ref(0)
  const translateY = ref(0)
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0, translateX: 0, translateY: 0 })
  const hasManualViewChange = ref(false)
  const activePointers = new Map()
  let pinchStart = null
  let viewTween = null

  function stopViewTween() {
    if (!viewTween) return
    viewTween.kill()
    viewTween = null
  }

  const transformStyle = computed(() => ({
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  }))

  const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`)

  function setScaleAroundPoint(nextScale, pointX, pointY) {
    const viewport = viewportRef.value
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const localX = pointX - rect.left
    const localY = pointY - rect.top
    const oldScale = scale.value
    const clampedScale = clamp(nextScale)
    if (clampedScale === oldScale) return

    const contentX = (localX - translateX.value) / oldScale
    const contentY = (localY - translateY.value) / oldScale
    translateX.value = localX - contentX * clampedScale
    translateY.value = localY - contentY * clampedScale
    scale.value = clampedScale
  }

  function zoomBy(delta) {
    const viewport = viewportRef.value
    if (!viewport) return
    stopViewTween()
    const rect = viewport.getBoundingClientRect()
    setScaleAroundPoint(scale.value + delta, rect.left + rect.width / 2, rect.top + rect.height / 2)
    hasManualViewChange.value = true
  }

  function zoomIn() {
    zoomBy(STEP)
  }

  function zoomOut() {
    zoomBy(-STEP)
  }

  function resetView() {
    stopViewTween()
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
    hasManualViewChange.value = true
  }

  function getViewState() {
    return {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
      hasManualViewChange: hasManualViewChange.value,
    }
  }

  async function restoreViewState(state) {
    if (
      !state ||
      !Number.isFinite(state.scale) ||
      !Number.isFinite(state.translateX) ||
      !Number.isFinite(state.translateY)
    ) {
      return false
    }
    stopViewTween()
    await nextTick()
    scale.value = clamp(state.scale)
    translateX.value = state.translateX
    translateY.value = state.translateY
    hasManualViewChange.value = Boolean(state.hasManualViewChange)
    return true
  }

  async function fitToView({ force = true } = {}) {
    if (!force && hasManualViewChange.value) return
    stopViewTween()
    await nextTick()
    const viewport = viewportRef.value
    const board = boardRef.value
    if (!viewport || !board) return

    const viewportRect = viewport.getBoundingClientRect()
    const boardWidth = board.offsetWidth
    const boardHeight = board.offsetHeight
    if (!viewportRect.width || !viewportRect.height || !boardWidth || !boardHeight) return

    const nextScale = clamp(
      Math.min(viewportRect.width / boardWidth, viewportRect.height / boardHeight, 1),
    )
    scale.value = nextScale
    translateX.value = (viewportRect.width - boardWidth * nextScale) / 2
    translateY.value = (viewportRect.height - boardHeight * nextScale) / 2
    hasManualViewChange.value = false
  }

  // rect 為 board 座標系（未縮放）的區域
  function focusRect(rect, { padding = 70, maxScale = 1 } = {}) {
    const viewport = viewportRef.value
    const board = boardRef.value
    if (!viewport || !board || !rect?.width || !rect?.height) return

    const viewportRect = viewport.getBoundingClientRect()
    if (!viewportRect.width || !viewportRect.height) return

    const boardScreen = board.getBoundingClientRect()
    const boardOffsetX = (boardScreen.left - viewportRect.left - translateX.value) / scale.value
    const boardOffsetY = (boardScreen.top - viewportRect.top - translateY.value) / scale.value

    const availWidth = Math.max(80, viewportRect.width - padding * 2)
    const availHeight = Math.max(80, viewportRect.height - padding * 2)
    const nextScale = clamp(Math.min(availWidth / rect.width, availHeight / rect.height, maxScale))

    const centerX = boardOffsetX + rect.x + rect.width / 2
    const centerY = boardOffsetY + rect.y + rect.height / 2
    const nextTranslateX = viewportRect.width / 2 - centerX * nextScale
    const nextTranslateY = viewportRect.height / 2 - centerY * nextScale

    // 聚焦視角是使用者的刻意選擇，先設 flag 讓 resize 的 fitToView({ force: false }) 不會搶回視角
    hasManualViewChange.value = true
    stopViewTween()
    const state = { s: scale.value, tx: translateX.value, ty: translateY.value }
    viewTween = gsap.to(state, {
      s: nextScale,
      tx: nextTranslateX,
      ty: nextTranslateY,
      duration: 0.55,
      ease: 'power2.inOut',
      onUpdate: () => {
        scale.value = state.s
        translateX.value = state.tx
        translateY.value = state.ty
      },
      onComplete: () => {
        viewTween = null
      },
    })
  }

  function getPointerGesture() {
    const pointers = [...activePointers.values()]
    if (pointers.length < 2) return null
    const [first, second] = pointers
    const centerX = (first.x + second.x) / 2
    const centerY = (first.y + second.y) / 2
    const distance = Math.hypot(second.x - first.x, second.y - first.y)
    return { centerX, centerY, distance }
  }

  function startPinchGesture() {
    const gesture = getPointerGesture()
    const viewport = viewportRef.value
    if (!gesture || gesture.distance === 0 || !viewport) return
    const rect = viewport.getBoundingClientRect()
    const localCenterX = gesture.centerX - rect.left
    const localCenterY = gesture.centerY - rect.top
    pinchStart = {
      ...gesture,
      scale: scale.value,
      contentX: (localCenterX - translateX.value) / scale.value,
      contentY: (localCenterY - translateY.value) / scale.value,
    }
  }

  function applyPinchGesture(gesture) {
    const viewport = viewportRef.value
    if (!viewport || !pinchStart?.distance) return
    const rect = viewport.getBoundingClientRect()
    const nextScale = clamp(pinchStart.scale * (gesture.distance / pinchStart.distance))
    scale.value = nextScale
    translateX.value = gesture.centerX - rect.left - pinchStart.contentX * nextScale
    translateY.value = gesture.centerY - rect.top - pinchStart.contentY * nextScale
    hasManualViewChange.value = true
  }

  function syncDragStartToPointer() {
    const pointer = [...activePointers.values()][0]
    if (!pointer) return
    dragStart.value = {
      x: pointer.x,
      y: pointer.y,
      translateX: translateX.value,
      translateY: translateY.value,
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    stopViewTween()
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    isDragging.value = true
    if (activePointers.size === 1) {
      syncDragStartToPointer()
    } else if (activePointers.size === 2) {
      startPinchGesture()
    }
    event.currentTarget?.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    if (!activePointers.has(event.pointerId)) return
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (activePointers.size >= 2) {
      const gesture = getPointerGesture()
      if (!gesture) return
      if (!pinchStart) startPinchGesture()
      applyPinchGesture(gesture)
      return
    }

    if (!isDragging.value) return
    translateX.value = dragStart.value.translateX + event.clientX - dragStart.value.x
    translateY.value = dragStart.value.translateY + event.clientY - dragStart.value.y
    hasManualViewChange.value = true
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId)
    if (activePointers.size >= 2) {
      startPinchGesture()
    } else {
      pinchStart = null
      if (activePointers.size === 1) {
        syncDragStartToPointer()
      } else {
        isDragging.value = false
      }
    }
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
  }

  function onWheel(event) {
    event.preventDefault()
    stopViewTween()
    const direction = event.deltaY > 0 ? -1 : 1
    const delta = direction * STEP
    setScaleAroundPoint(scale.value + delta, event.clientX, event.clientY)
    hasManualViewChange.value = true
  }

  return {
    scale,
    translateX,
    translateY,
    isDragging,
    transformStyle,
    zoomPercent,
    zoomIn,
    zoomOut,
    resetView,
    getViewState,
    restoreViewState,
    fitToView,
    focusRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  }
}
