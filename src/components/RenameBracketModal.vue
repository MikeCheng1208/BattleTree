<script setup>
import { onMounted, ref } from 'vue'

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['cancel', 'save'])
const name = ref(props.bracket.name)
const inputRef = ref(null)

function save() {
  const nextName = name.value.trim()
  if (nextName) emit('save', nextName)
}

onMounted(() => {
  inputRef.value?.focus()
  inputRef.value?.select()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop rename-bracket-backdrop" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
      <section
        class="modal-panel compact rename-bracket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-bracket-title"
      >
        <header class="modal-header">
          <h2 id="rename-bracket-title">重新命名對戰表</h2>
          <button type="button" class="icon-button" aria-label="取消改名" @click="emit('cancel')">×</button>
        </header>

        <form class="rename-bracket-form" @submit.prevent="save">
          <label>
            <span>對戰表名稱</span>
            <input ref="inputRef" v-model="name" type="text" maxlength="60" autocomplete="off" />
          </label>
          <div class="rename-bracket-actions">
            <button type="button" class="ghost" @click="emit('cancel')">取消</button>
            <button type="submit" class="primary-action" :disabled="!name.trim()">儲存名稱</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
