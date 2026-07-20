<script setup>
import { onMounted, ref } from 'vue'

defineProps({
  bracket: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['cancel', 'save', 'delete'])
const saveButtonRef = ref(null)

onMounted(() => saveButtonRef.value?.focus())
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop close-bracket-backdrop" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
      <section
        class="modal-panel compact close-bracket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-bracket-title"
        aria-describedby="close-bracket-description"
      >
        <header class="modal-header">
          <div>
            <span class="new-bracket-kicker">CLOSE BATTLE</span>
            <h2 id="close-bracket-title">關閉「{{ bracket.name }}」？</h2>
          </div>
          <button type="button" class="icon-button" aria-label="取消關閉" @click="emit('cancel')">×</button>
        </header>

        <p id="close-bracket-description" class="close-bracket-description">
          儲存並關閉會保留參賽名單、賽制與目前賽果，之後可從「所有對戰表」重新開啟。刪除對局後將無法復原。
        </p>

        <div class="close-bracket-actions">
          <button type="button" class="ghost" @click="emit('cancel')">取消</button>
          <button type="button" class="danger close-bracket-delete" @click="emit('delete')">刪除對局</button>
          <button ref="saveButtonRef" type="button" class="primary-action" @click="emit('save')">
            儲存並關閉
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
