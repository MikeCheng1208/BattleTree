<script setup>
defineProps({
  brackets: {
    type: Array,
    required: true,
  },
  currentId: String,
  openIds: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['close', 'select', 'delete'])

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}
</script>

<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <section class="modal-panel compact">
      <header class="modal-header">
        <h2>所有對戰表</h2>
        <button type="button" class="icon-button" aria-label="關閉" @click="$emit('close')">×</button>
      </header>

      <div class="bracket-list">
        <article v-for="bracket in brackets" :key="bracket.id" class="list-item">
          <button type="button" class="list-main" @click="$emit('select', bracket.id)">
            <strong>{{ bracket.name }}</strong>
            <span>{{ bracket.status === 'ready' ? '已產生' : '設定中' }} · {{ formatDate(bracket.updatedAt) }}</span>
          </button>
          <span v-if="bracket.id === currentId" class="current-pill">目前</span>
          <span v-else-if="openIds.includes(bracket.id)" class="current-pill open">已開啟</span>
          <button type="button" class="danger ghost" @click="$emit('delete', bracket.id)">刪除</button>
        </article>
      </div>
    </section>
  </div>
</template>
