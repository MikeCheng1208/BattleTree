<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  result: Object,
  placeholderA: {
    type: String,
    default: '比分',
  },
  placeholderB: {
    type: String,
    default: '比分',
  },
})

const emit = defineEmits(['save'])

const scoreA = ref('')
const scoreB = ref('')

watch(
  () => props.result,
  (result) => {
    scoreA.value = result?.scoreA ?? ''
    scoreB.value = result?.scoreB ?? ''
  },
  { immediate: true },
)

function normalizeScore(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}
</script>

<template>
  <div class="score-editor">
    <input v-model="scoreA" type="number" min="0" :placeholder="placeholderA" />
    <span>:</span>
    <input v-model="scoreB" type="number" min="0" :placeholder="placeholderB" />
    <button type="button" @click="emit('save', normalizeScore(scoreA), normalizeScore(scoreB))">比分</button>
  </div>
</template>
