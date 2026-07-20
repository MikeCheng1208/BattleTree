<script setup>
import { ref } from 'vue'

const props = defineProps({
  slotIndex: {
    type: Number,
    required: true,
  },
  currentPlayer: Object,
  isConfirmedBye: Boolean,
  unassignedPlayers: {
    type: Array,
    default: () => [],
  },
  loserCandidates: {
    type: Array,
    default: () => [],
  },
  awaitingSlotCount: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'fill',
  'create',
  'clear',
  'confirm-bye',
  'confirm-all-byes',
  'revoke-bye',
  'close',
])

const newName = ref('')
const newTitle = ref('')

function submitCreate() {
  const name = newName.value.trim()
  if (!name) return
  emit('create', { name, title: newTitle.value.trim() })
}

function fillRandomLoser() {
  if (!props.loserCandidates.length) return
  const randomIndex = Math.floor(Math.random() * props.loserCandidates.length)
  emit('fill', props.loserCandidates[randomIndex].id)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop slot-editor-backdrop" @click.self="emit('close')">
      <section class="modal-panel compact slot-editor-modal" role="dialog" aria-modal="true" aria-labelledby="slot-editor-title">
        <header class="modal-header">
          <div>
            <span class="slot-editor-kicker">格位 #{{ slotIndex + 1 }}</span>
            <h2 id="slot-editor-title">
              {{ currentPlayer ? `編輯格位：${currentPlayer.displayName}` : isConfirmedBye ? '已確認輪空' : '填入格位' }}
            </h2>
          </div>
          <button type="button" class="icon-button" aria-label="關閉" @click="emit('close')">×</button>
        </header>

        <div class="slot-editor-body">
          <div v-if="unassignedPlayers.length" class="slot-editor-group">
            <div class="slot-editor-group-header">
              <strong>名單中未排入</strong>
              <span>{{ unassignedPlayers.length }} 人</span>
            </div>
            <div class="slot-candidate-list">
              <button
                v-for="player in unassignedPlayers"
                :key="player.id"
                type="button"
                class="slot-candidate"
                @click="emit('fill', player.id)"
              >
                <span>#{{ player.seed }}</span>
                <strong>{{ player.displayName }}</strong>
              </button>
            </div>
          </div>

          <div v-if="loserCandidates.length" class="slot-editor-group">
            <div class="slot-editor-group-header">
              <strong>第一輪敗者（敗部復活）</strong>
              <div class="slot-editor-group-tools">
                <span>{{ loserCandidates.length }} 人</span>
                <button type="button" class="slot-editor-random" @click="fillRandomLoser">
                  隨機選擇 1 人
                </button>
              </div>
            </div>
            <p class="slot-editor-hint">敗者填入後將在第一輪再打一次。</p>
            <div class="slot-candidate-list">
              <button
                v-for="player in loserCandidates"
                :key="player.id"
                type="button"
                class="slot-candidate loser"
                @click="emit('fill', player.id)"
              >
                <span>#{{ player.seed }}</span>
                <strong>{{ player.displayName }}</strong>
              </button>
            </div>
          </div>

          <div class="slot-editor-group">
            <div class="slot-editor-group-header">
              <strong>手動新增選手</strong>
            </div>
            <div class="slot-editor-create">
              <input
                v-model="newName"
                type="text"
                placeholder="選手姓名"
                @keyup.enter="submitCreate"
              />
              <input
                v-model="newTitle"
                type="text"
                placeholder="稱號（選填）"
                @keyup.enter="submitCreate"
              />
              <button type="button" class="secondary-action" :disabled="!newName.trim()" @click="submitCreate">
                新增並填入
              </button>
            </div>
          </div>

          <div class="stage-actions slot-editor-actions">
            <button
              v-if="!currentPlayer && !isConfirmedBye"
              type="button"
              class="secondary-action"
              @click="emit('confirm-all-byes')"
            >
              全部確定輪空（{{ awaitingSlotCount }} 格）
            </button>
            <button v-if="currentPlayer" type="button" class="secondary-action" @click="emit('clear')">
              清空此格（改回待定）
            </button>
            <button v-else-if="isConfirmedBye" type="button" class="secondary-action" @click="emit('revoke-bye')">
              取消輪空（改回待定）
            </button>
            <button v-else type="button" class="secondary-action" @click="emit('confirm-bye')">
              確定輪空（對手晉級）
            </button>
            <button type="button" class="ghost" @click="emit('close')">取消</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
