<script setup>
import { computed, ref } from 'vue'
import { DEFAULT_BRACKET_FORMAT, FORMAT_OPTIONS } from '../constants/bracketOptions'

const props = defineProps({
  currentBracket: Object,
  brackets: {
    type: Array,
    default: () => [],
  },
  openIds: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'create', 'open-saved'])
const bracketName = ref('')
const selectedFormat = ref(DEFAULT_BRACKET_FORMAT)
const rosterSource = ref('blank')
const savedBracketId = ref('')
const availableSavedBrackets = computed(() =>
  props.brackets.filter((bracket) => !props.openIds.includes(bracket.id)),
)

function getBracketStatus(bracket) {
  if (bracket.status === 'setup') return '設定中'
  if (bracket.status === 'prelim') return '預賽中'
  return '進行中'
}

function createBracket() {
  emit('create', {
    name: bracketName.value.trim(),
    format: selectedFormat.value,
    rosterSource: rosterSource.value,
  })
}

function openSavedBracket() {
  if (savedBracketId.value) emit('open-saved', savedBracketId.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop new-bracket-backdrop" @click.self="emit('close')">
      <section class="modal-panel new-bracket-modal" role="dialog" aria-modal="true" aria-labelledby="new-bracket-title">
        <header class="modal-header">
          <div>
            <span class="new-bracket-kicker">NEW BATTLE</span>
            <h2 id="new-bracket-title">新增對戰表</h2>
          </div>
          <button type="button" class="icon-button" aria-label="關閉" @click="emit('close')">×</button>
        </header>

        <div class="new-bracket-body">
          <fieldset class="new-bracket-fieldset saved-bracket-fieldset">
            <legend>從已儲存的對戰表開啟</legend>
            <p>選取先前儲存並關閉的對戰表，保留原本名單、賽制與目前賽果。</p>
            <div class="saved-bracket-open-row">
              <select
                v-model="savedBracketId"
                class="saved-bracket-select"
                :disabled="!availableSavedBrackets.length"
                aria-label="選擇已儲存的對戰表"
              >
                <option value="">
                  {{ availableSavedBrackets.length ? '請選擇對戰表' : '目前沒有已儲存且未開啟的對戰表' }}
                </option>
                <option v-for="bracket in availableSavedBrackets" :key="bracket.id" :value="bracket.id">
                  {{ bracket.name }} · {{ bracket.players?.length ?? 0 }} 人 · {{ getBracketStatus(bracket) }}
                </option>
              </select>
              <button
                type="button"
                class="secondary-action"
                :disabled="!savedBracketId"
                @click="openSavedBracket"
              >
                開啟為 Tab
              </button>
            </div>
          </fieldset>

          <div class="new-bracket-divider" aria-hidden="true"><span>或建立新的對戰表</span></div>

          <fieldset class="new-bracket-fieldset">
            <legend>1. 輸入對戰表名稱</legend>
            <label class="new-bracket-name-field">
              <span>對戰表名稱</span>
              <input
                v-model="bracketName"
                type="text"
                maxlength="60"
                placeholder="未填寫時自動使用「新對戰表」"
                autocomplete="off"
              />
            </label>
          </fieldset>

          <fieldset class="new-bracket-fieldset">
            <legend>2. 選擇賽制</legend>
            <div class="new-bracket-format-grid" role="radiogroup" aria-label="賽制">
              <button
                v-for="option in FORMAT_OPTIONS"
                :key="option.value"
                type="button"
                class="new-bracket-option"
                :class="{ active: selectedFormat === option.value }"
                role="radio"
                :aria-checked="selectedFormat === option.value"
                @click="selectedFormat = option.value"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
              </button>
            </div>
          </fieldset>

          <fieldset class="new-bracket-fieldset">
            <legend>3. 選擇名單來源</legend>
            <div class="new-bracket-roster-grid" role="radiogroup" aria-label="名單來源">
              <button
                type="button"
                class="new-bracket-option roster"
                :class="{ active: rosterSource === 'blank' }"
                role="radio"
                :aria-checked="rosterSource === 'blank'"
                @click="rosterSource = 'blank'"
              >
                <strong>空白名單</strong>
                <span>建立預設 4 位參賽者，再自行編輯或匯入 CSV。</span>
              </button>
              <button
                type="button"
                class="new-bracket-option roster"
                :class="{ active: rosterSource === 'current' }"
                :disabled="!currentBracket"
                role="radio"
                :aria-checked="rosterSource === 'current'"
                @click="rosterSource = 'current'"
              >
                <strong>複製目前名單</strong>
                <span v-if="currentBracket">從「{{ currentBracket.name }}」複製 {{ currentBracket.players.length }} 位參賽者，不包含賽果。</span>
                <span v-else>目前沒有可複製的對戰表。</span>
              </button>
            </div>
          </fieldset>

          <div class="new-bracket-actions">
            <button type="button" class="ghost" @click="emit('close')">取消</button>
            <button type="button" class="primary-action" @click="createBracket">建立並開啟</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
