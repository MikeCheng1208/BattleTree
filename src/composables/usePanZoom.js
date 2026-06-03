import { computed, nextTick, ref } from 'vue'

const MIN_SCALE = 0.35
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
    const rect = viewport.getBoundingClientRect()
    setScaleAroundPoint(scale.value + delta, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  function zoomIn() {
    zoomBy(STEP)
  }

  function zoomOut() {
    zoomBy(-STEP)
  }

  function resetView() {
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
  }

  async function fitToView() {
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
  }

  function onPointerDown(event) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    isDragging.value = true
    dragStart.value = {
      x: event.clientX,
      y: event.clientY,
      translateX: translateX.value,
      translateY: translateY.value,
    }
    event.currentTarget?.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    if (!isDragging.value) return
    translateX.value = dragStart.value.translateX + event.clientX - dragStart.value.x
    translateY.value = dragStart.value.translateY + event.clientY - dragStart.value.y
  }

  function onPointerUp(event) {
    isDragging.value = false
    event.currentTarget?.releasePointerCapture?.(event.pointerId)
  }

  function onWheel(event) {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    const delta = direction * STEP
    setScaleAroundPoint(scale.value + delta, event.clientX, event.clientY)
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
    fitToView,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  }
}
