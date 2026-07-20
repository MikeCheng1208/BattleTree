<script setup>
import { nextTick, ref } from 'vue'
import { getPodium } from '../composables/useBracketEngine'

const props = defineProps({
  brackets: {
    type: Array,
    default: () => [],
  },
  currentId: String,
})

const emit = defineEmits(['select', 'close', 'add', 'rename', 'request-rename'])
const editingId = ref(null)
const editingName = ref('')

function getStatus(bracket) {
  if (bracket.status === 'setup') return { label: '設定中', value: 'setup' }
  if (bracket.status === 'prelim') return { label: '預賽中', value: 'prelim' }
  if (getPodium(bracket).championId) return { label: '已完成', value: 'complete' }
  return { label: '進行中', value: 'ready' }
}

function selectFromMobile(event) {
  if (event.target.value) emit('select', event.target.value)
}

function startEditing(bracket) {
  editingId.value = bracket.id
  editingName.value = bracket.name
  nextTick(() => {
    const input = document.getElementById(`bracket-tab-name-${bracket.id}`)
    input?.focus()
    input?.select()
  })
}

function saveEditing(bracket) {
  if (editingId.value !== bracket.id) return
  const name = editingName.value.trim()
  if (name && name !== bracket.name) emit('rename', bracket.id, name)
  editingId.value = null
}

function cancelEditing() {
  editingId.value = null
}

function handleTabKeydown(event, bracket) {
  if (event.key === 'F2') {
    event.preventDefault()
    startEditing(bracket)
    return
  }
  const bracketId = bracket.id
  const index = props.brackets.findIndex((bracket) => bracket.id === bracketId)
  if (index === -1 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  let nextIndex = index
  if (event.key === 'ArrowLeft') nextIndex = (index - 1 + props.brackets.length) % props.brackets.length
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % props.brackets.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = props.brackets.length - 1
  const nextId = props.brackets[nextIndex]?.id
  if (!nextId) return
  emit('select', nextId)
  requestAnimationFrame(() => document.getElementById(`bracket-tab-${nextId}`)?.focus())
}
</script>

<template>
  <section class="bracket-tabs" aria-label="開啟中的對戰表">
    <div class="bracket-tabs-desktop">
      <div class="bracket-tab-scroll" role="tablist" aria-label="對戰表分頁">
        <div
          v-for="bracket in brackets"
          :key="bracket.id"
          class="bracket-tab"
          :class="{ active: bracket.id === currentId }"
        >
          <div v-if="editingId === bracket.id" class="bracket-tab-edit">
            <span class="bracket-tab-status" :data-status="getStatus(bracket).value" aria-hidden="true"></span>
            <input
              :id="`bracket-tab-name-${bracket.id}`"
              v-model="editingName"
              type="text"
              maxlength="60"
              :aria-label="`重新命名 ${bracket.name}`"
              @blur="saveEditing(bracket)"
              @keydown.enter.prevent="saveEditing(bracket)"
              @keydown.esc.prevent="cancelEditing"
            />
          </div>
          <button
            v-else
            :id="`bracket-tab-${bracket.id}`"
            type="button"
            class="bracket-tab-main"
            role="tab"
            :aria-selected="bracket.id === currentId"
            aria-controls="bracket-workspace"
            :tabindex="bracket.id === currentId ? 0 : -1"
            :title="`${bracket.name} · ${getStatus(bracket).label} · 雙擊改名`"
            @click="emit('select', bracket.id)"
            @dblclick.stop="startEditing(bracket)"
            @keydown="handleTabKeydown($event, bracket)"
          >
            <span class="bracket-tab-status" :data-status="getStatus(bracket).value" aria-hidden="true"></span>
            <span>{{ bracket.name }}</span>
          </button>
          <button
            type="button"
            class="bracket-tab-close"
            :aria-label="`關閉 ${bracket.name} 分頁`"
            title="關閉分頁"
            @click="emit('close', bracket.id)"
          >
            ×
          </button>
        </div>
      </div>
      <button type="button" class="bracket-tab-add" aria-label="新增對戰表" title="新增對戰表" @click="emit('add')">
        ＋
      </button>
    </div>

    <div class="bracket-tabs-mobile">
      <select
        :value="currentId ?? ''"
        :disabled="!brackets.length"
        aria-label="切換對戰表"
        @change="selectFromMobile"
      >
        <option v-if="!brackets.length" value="">尚無開啟的對戰表</option>
        <option v-for="bracket in brackets" :key="bracket.id" :value="bracket.id">
          {{ bracket.name }} · {{ getStatus(bracket).label }}
        </option>
      </select>
      <button
        type="button"
        class="bracket-mobile-rename"
        :disabled="!currentId"
        aria-label="重新命名目前對戰表"
        title="重新命名"
        @click="emit('request-rename', currentId)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z" />
          <path d="m12.9 6.9 4.2 4.2" />
        </svg>
      </button>
      <button
        type="button"
        class="bracket-mobile-close"
        :disabled="!currentId"
        aria-label="關閉目前分頁"
        title="關閉分頁"
        @click="emit('close', currentId)"
      >
        ×
      </button>
      <button type="button" class="bracket-tab-add" aria-label="新增對戰表" @click="emit('add')">＋</button>
    </div>
  </section>
</template>
