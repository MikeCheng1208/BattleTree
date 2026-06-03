import { computed } from 'vue'
import { useFullscreen } from '@vueuse/core'
import { toJpeg } from 'html-to-image'

function sanitizeFileName(name) {
  return (name || 'BattleTree')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
}

function resolveRef(targetRef) {
  if (typeof targetRef === 'function') return targetRef()
  return targetRef?.value ?? null
}

export function useBracketExport(targetRef, bracketRef, downloadTargetRef = targetRef) {
  const fullscreen = useFullscreen(targetRef)

  const fileName = computed(() => `${sanitizeFileName(bracketRef.value?.name)}.jpg`)

  async function downloadJpeg() {
    const target = resolveRef(downloadTargetRef)
    if (!target) return
    const dataUrl = await toJpeg(target, {
      quality: 0.95,
      backgroundColor: '#f4f4f4',
      pixelRatio: 2,
    })
    const link = document.createElement('a')
    link.download = fileName.value
    link.href = dataUrl
    link.click()
  }

  return {
    ...fullscreen,
    downloadJpeg,
  }
}
