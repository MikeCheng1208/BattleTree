<script setup>
import { computed, ref, watch } from 'vue'
import csvHelpOpenSheet from '../assets/01-打開試算表.png'
import csvHelpNameColumn from '../assets/02-確認一定欄位名稱要是姓名.png'
import csvHelpDownloadCsv from '../assets/03-匯出csv.png'
import { parseCsvPlayerNames } from '../composables/useCsvPlayers'
import { getRepechageRequirements, validatePlayers } from '../composables/useBracketEngine'

const props = defineProps({
  bracket: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits([
  'update-name',
  'set-player-count',
  'import-players',
  'update-player',
  'remove-player',
  'reorder-player-seeds',
  'set-pairing-mode',
  'set-group-count',
  'set-repechage-enabled',
  'set-repechage-selection-mode',
  'generate',
])
const GROUP_OPTIONS = [1, 2, 4, 8]

const playerCount = ref(props.bracket.players.length)
const submitErrors = ref([])
const importErrors = ref([])
const importSummary = ref('')
const csvInputRef = ref(null)
const showCsvHelp = ref(false)
const showRepechageExplainer = ref(false)
const csvHelpSteps = [
  {
    image: csvHelpOpenSheet,
    title: '打開試算表',
    description: '在 Google 表單回覆頁面點擊綠色試算表圖示，或點選「在試算表中查看」。',
  },
  {
    image: csvHelpNameColumn,
    title: '確認姓名欄位',
    description: '輸入名字的欄位一定要叫「姓名」，不可以有其他多餘文字、空白、括號或符號。',
  },
  {
    image: csvHelpDownloadCsv,
    title: '下載 CSV',
    description: '在 Google 試算表依序點選「檔案」→「下載」→「逗號分隔值檔案 (.csv)」。',
  },
]
const availableGroupOptions = computed(() =>
  GROUP_OPTIONS.filter((count) => count <= Math.floor(props.bracket.players.length / 2)),
)
const repechageRequirements = computed(() =>
  getRepechageRequirements(props.bracket.players, props.bracket.pairingMode, props.bracket.groupCount),
)

watch(
  () => props.bracket.players.length,
  (count) => {
    playerCount.value = count
  },
)

const validationErrors = computed(() => validatePlayers(props.bracket.players))

function applyPlayerCount() {
  emit('set-player-count', playerCount.value)
}

function generate() {
  submitErrors.value = validationErrors.value
  if (!submitErrors.value.length) emit('generate')
}

async function handleCsvImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  importErrors.value = []
  importSummary.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const { names, errors } = parseCsvPlayerNames(text)
    if (errors.length) {
      importErrors.value = errors
      return
    }

    emit('import-players', names)
    playerCount.value = names.length
    importSummary.value = `已匯入 ${names.length} 位參賽者`
  } catch (error) {
    importErrors.value = [error instanceof Error ? error.message : 'CSV 讀取失敗，請確認檔案格式']
  }
}
</script>

<template>
  <section class="setup-panel">
    <label class="field setup-title-field">
      <span>比賽名稱</span>
      <input
        :value="bracket.name"
        type="text"
        @input="emit('update-name', $event.target.value)"
      />
    </label>

    <div class="setup-grid">
      <div class="field setup-control-card participant-import-card">
        <label for="player-count-input">參賽人數</label>
        <div class="player-count-row">
          <input
            id="player-count-input"
            v-model.number="playerCount"
            type="number"
            min="2"
            @change="applyPlayerCount"
          />
        </div>
        <div class="csv-actions">
          <input
            ref="csvInputRef"
            class="sr-only-input"
            type="file"
            accept=".csv,text/csv"
            @change="handleCsvImport"
          />
          <button type="button" class="secondary-action csv-import-button" @click="csvInputRef?.click()">
            匯入參賽名單(.csv)
          </button>
          <button type="button" class="secondary-action csv-help-button" @click="showCsvHelp = true">
            如何取得.csv
          </button>
        </div>
      </div>

      <div class="field setup-control-card group-count-card">
        <span>分組數</span>
        <div class="segmented group-count-control" role="radiogroup" aria-label="分組數">
          <button
            v-for="count in availableGroupOptions"
            :key="count"
            type="button"
            :class="{ active: bracket.groupCount === count }"
            @click="emit('set-group-count', count)"
          >
            {{ count === 1 ? '不分組' : `${count} 組` }}
          </button>
        </div>
      </div>
    </div>

    <ul v-if="importErrors.length" class="error-list">
      <li v-for="error in importErrors" :key="error">{{ error }}</li>
    </ul>
    <p v-else-if="importSummary" class="import-summary">{{ importSummary }}</p>

    <div class="player-editor-toolbar">
      <div>
        <strong>參賽名單</strong>
        <span>移除會保留原編號，需要時再手動重新排序。</span>
      </div>
      <button type="button" class="secondary-action reseed-button" @click="emit('reorder-player-seeds')">
        重新排序參賽編號
      </button>
      <div class="segmented pairing-mode-control" role="radiogroup" aria-label="配對方式">
        <button
          type="button"
          :class="{ active: bracket.pairingMode === 'order' }"
          @click="emit('set-pairing-mode', 'order')"
        >
          依序配對
        </button>
        <button
          type="button"
          :class="{ active: bracket.pairingMode === 'random' }"
          @click="emit('set-pairing-mode', 'random')"
        >
          隨機抽籤
        </button>
      </div>
    </div>

    <div class="player-editor">
      <div class="player-editor-head">
        <span>編號</span>
        <span>選手姓名</span>
        <span>確認</span>
        <span>移除</span>
      </div>
      <div v-for="player in bracket.players" :key="player.id" class="player-row">
        <span class="seed-display">#{{ player.seed }}</span>
        <input
          :value="player.name"
          type="text"
          @input="emit('update-player', player.id, { name: $event.target.value })"
        />
        <button
          type="button"
          class="registration-check"
          :class="{ active: player.registrationConfirmed }"
          :aria-pressed="Boolean(player.registrationConfirmed)"
          :aria-label="player.registrationConfirmed ? `取消確認 ${player.name}` : `確認報名 ${player.name}`"
          @click="emit('update-player', player.id, { registrationConfirmed: !player.registrationConfirmed })"
        >
          ✓
        </button>
        <button
          type="button"
          class="remove-player-button"
          :disabled="bracket.players.length <= 2"
          :aria-label="`移除 ${player.name}`"
          @click="emit('remove-player', player.id)"
        >
          移除
        </button>
      </div>
    </div>

    <ul v-if="submitErrors.length" class="error-list">
      <li v-for="error in submitErrors" :key="error">{{ error }}</li>
    </ul>

    <button type="button" class="primary-action" @click="generate">產生對戰表</button>

    <section class="repechage-setup-card">
      <div class="repechage-setup-copy">
        <span>敗部復活模式</span>
        <strong>{{ bracket.repechage?.enabled ? '已啟用' : '未啟用' }}</strong>
        <p>
          系統只會在同一支線即將連續輪空兩次時啟動補位，第一輪完成後從敗者中產生復活賽。
        </p>
      </div>
      <div class="repechage-setup-controls">
        <button
          type="button"
          class="repechage-toggle"
          :class="{ active: bracket.repechage?.enabled }"
          @click="emit('set-repechage-enabled', !bracket.repechage?.enabled)"
        >
          <span class="repechage-toggle-track" aria-hidden="true">
            <span></span>
          </span>
          <span>{{ bracket.repechage?.enabled ? '已啟用敗部復活' : '啟用敗部復活' }}</span>
        </button>
        <div class="segmented repechage-mode-control" role="radiogroup" aria-label="敗部復活選人方式">
          <button
            type="button"
            :disabled="!bracket.repechage?.enabled"
            :class="{ active: (bracket.repechage?.selectionMode ?? 'random') === 'random' }"
            @click="emit('set-repechage-selection-mode', 'random')"
          >
            隨機抽選
          </button>
          <button
            type="button"
            :disabled="!bracket.repechage?.enabled"
            :class="{ active: bracket.repechage?.selectionMode === 'manual' }"
            @click="emit('set-repechage-selection-mode', 'manual')"
          >
            手動指定
          </button>
        </div>
      </div>
      <div class="repechage-requirement">
        <template v-if="repechageRequirements.matchCount">
          預估需要
          <strong>{{ repechageRequirements.playerCount }}</strong>
          位第一輪敗者，進行
          <strong>{{ repechageRequirements.matchCount }}</strong>
          場敗部復活賽。
        </template>
        <template v-else>
          目前賽程不會連續輪空，無需建立敗部復活賽。
        </template>
      </div>
      <button
        type="button"
        class="repechage-explainer-toggle"
        :aria-expanded="showRepechageExplainer"
        @click="showRepechageExplainer = !showRepechageExplainer"
      >
        <span>{{ showRepechageExplainer ? '收合規則說明' : '查看規則說明' }}</span>
        <strong>{{ showRepechageExplainer ? '−' : '+' }}</strong>
      </button>
      <div v-if="showRepechageExplainer" class="repechage-explainer">
        <strong>出現條件</strong>
        <p>
          敗部復活只會在某位選手或某條支線已經輪空一次，下一輪又即將再次輪空時出現。
          這時系統會等第一輪全部完成後，從第一輪敗者中建立復活賽，勝者補進原本第二次輪空的位置。
        </p>
        <strong>不會出現的情況</strong>
        <p>
          如果賽程沒有連續輪空兩次，或只是一般的一次輪空，就算啟用敗部復活也不會產生復活賽。
          這個模式不是每場比賽都會固定增加敗部賽，只用來修正連續輪空造成的不公平。
        </p>
      </div>
    </section>
  </section>

  <Teleport to="body">
    <div v-if="showCsvHelp" class="modal-backdrop csv-help-backdrop" @click.self="showCsvHelp = false">
      <section class="modal-panel compact csv-help-modal" role="dialog" aria-modal="true" aria-labelledby="csv-help-title">
        <header class="modal-header">
          <h2 id="csv-help-title">CSV 匯入教學</h2>
          <button type="button" class="icon-button" aria-label="關閉" @click="showCsvHelp = false">×</button>
        </header>

        <div class="csv-help-body">
          <p>
            BattleTree 會讀取 CSV 裡欄位名稱為「姓名」的資料，請先從 Google 表單回覆建立試算表，再下載 CSV。
          </p>

          <ol class="csv-help-steps">
            <li v-for="(step, index) in csvHelpSteps" :key="step.title">
              <figure>
                <img :src="step.image" :alt="step.title" />
              </figure>
              <div class="csv-help-step-copy">
                <span>{{ index + 1 }}</span>
                <div>
                  <strong>{{ step.title }}</strong>
                  <p>{{ step.description }}</p>
                </div>
              </div>
            </li>
          </ol>

          <div class="csv-help-note">
            <strong>注意</strong>
            <p>CSV 第一列需要有「姓名」欄位；其他欄位例如時間戳記、Email、電話不會被匯入。</p>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
