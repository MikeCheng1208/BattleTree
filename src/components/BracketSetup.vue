<script setup>
import { computed, ref, watch } from 'vue'
import csvHelpOpenSheet from '../assets/01-打開試算表.png'
import csvHelpNameColumn from '../assets/02-確認一定欄位名稱要是姓名.png'
import csvHelpDownloadCsv from '../assets/03-匯出csv.png'
import { extractPlayerEntries, parseCsvTable } from '../composables/useCsvPlayers'
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
  'add-player',
  'import-players',
  'update-player',
  'remove-player',
  'reorder-player-seeds',
  'shuffle-player-seeds',
  'set-pairing-mode',
  'set-group-count',
  'set-repechage-enabled',
  'set-repechage-selection-mode',
  'set-repechage-entry-count',
  'generate',
])
const GROUP_OPTIONS = [1, 2, 4, 8]

const playerCount = ref(props.bracket.players.length)
const submitErrors = ref([])
const importErrors = ref([])
const importSummary = ref('')
const csvInputRef = ref(null)
const showCsvHelp = ref(false)
const showCsvColumnPicker = ref(false)
const csvHeader = ref([])
const csvRows = ref([])
const csvSelectedColumn = ref(0)
const csvSelectedTitleColumn = ref(-1)
const csvColumnErrors = ref([])
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
    description: '確認試算表裡有一欄是選手名字。匯入時可以自行選擇要用哪個欄位；欄位名稱是「姓名」時會自動預選。',
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
const repechageEntryCount = computed(() =>
  Math.min(
    Math.max(1, Number(props.bracket.repechage?.entryCount) || 2),
    Math.max(1, repechageRequirements.value.playerCount || 1),
  ),
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

const csvColumnOptions = computed(() =>
  csvHeader.value.map((label, index) => {
    const previews = []
    for (const row of csvRows.value) {
      const value = row[index]?.trim()
      if (value) previews.push(value)
      if (previews.length >= 3) break
    }
    return {
      index,
      label: label || `第 ${index + 1} 欄`,
      preview: previews.join('、') || '（無資料）',
    }
  }),
)

async function handleCsvImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  importErrors.value = []
  importSummary.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const { header, rows, defaultColumnIndex, defaultTitleColumnIndex, errors } = parseCsvTable(text)
    if (errors.length) {
      importErrors.value = errors
      return
    }

    csvHeader.value = header
    csvRows.value = rows
    csvSelectedColumn.value = defaultColumnIndex === -1 ? 0 : defaultColumnIndex
    csvSelectedTitleColumn.value =
      defaultTitleColumnIndex === csvSelectedColumn.value ? -1 : defaultTitleColumnIndex
    csvColumnErrors.value = []
    showCsvColumnPicker.value = true
  } catch (error) {
    importErrors.value = [error instanceof Error ? error.message : 'CSV 讀取失敗，請確認檔案格式']
  }
}

function selectCsvNameColumn(index) {
  csvSelectedColumn.value = index
  if (csvSelectedTitleColumn.value === index) csvSelectedTitleColumn.value = -1
  csvColumnErrors.value = []
}

function selectCsvTitleColumn(index) {
  csvSelectedTitleColumn.value = index
  csvColumnErrors.value = []
}

function confirmCsvColumn() {
  const { entries, errors } = extractPlayerEntries(
    csvRows.value,
    csvSelectedColumn.value,
    csvSelectedTitleColumn.value,
  )
  if (errors.length) {
    csvColumnErrors.value = errors
    return
  }

  emit('import-players', entries)
  playerCount.value = entries.length
  importSummary.value = `已匯入 ${entries.length} 位參賽者`
  closeCsvColumnPicker()
}

function closeCsvColumnPicker() {
  showCsvColumnPicker.value = false
  csvHeader.value = []
  csvRows.value = []
  csvColumnErrors.value = []
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
        <span>移除會保留原編號，需要時再手動重新排序。有填稱號的選手，對戰表會顯示稱號。</span>
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
        <button
          type="button"
          class="shuffle-seeds-button"
          @click="emit('shuffle-player-seeds')"
        >
          隨機重排編號
        </button>
      </div>
    </div>

    <div class="player-editor">
      <div class="player-editor-head">
        <span>編號</span>
        <span>選手姓名</span>
        <span>稱號</span>
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
        <input
          :value="player.title"
          type="text"
          placeholder="選填"
          @input="emit('update-player', player.id, { title: $event.target.value })"
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

    <div class="setup-bottom-actions">
      <button type="button" class="secondary-action add-player-button" @click="emit('add-player')">
        +1 新增參賽者
      </button>
    </div>

    <button type="button" class="primary-action" @click="generate">產生對戰表</button>

    <section class="repechage-setup-card">
      <div class="repechage-setup-copy">
        <span>敗部復活模式</span>
        <strong>{{ bracket.repechage?.enabled ? '已啟用' : '未啟用' }}</strong>
        <p>
          系統只會在同一支線原本會連續輪空兩次時啟動，第一輪完成後依設定名額安插第一輪敗者。
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
      <label class="repechage-entry-field">
        <span>復活名額</span>
        <input
          :value="repechageEntryCount"
          type="number"
          min="1"
          :max="Math.max(1, repechageRequirements.playerCount)"
          :disabled="!bracket.repechage?.enabled || !repechageRequirements.playerCount"
          @change="emit('set-repechage-entry-count', $event.target.value)"
        />
      </label>
      <div class="repechage-requirement">
        <template v-if="repechageRequirements.matchCount">
          最多可安插
          <strong>{{ repechageRequirements.playerCount }}</strong>
          位第一輪敗者；目前設定
          <strong>{{ repechageEntryCount }}</strong>
          位。
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
          敗部復活只會在某位選手或某條支線原本會連續輪空兩次時出現。
          這時系統會等第一輪全部完成後，依照復活名額從第一輪敗者中挑選選手，安插到第一輪後面的空位。
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
            匯入 CSV 後可以自行選擇要用哪個欄位當作選手姓名，請先從 Google 表單回覆建立試算表，再下載 CSV。
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
            <p>CSV 第一列要是欄位標題。匯入時會跳出欄位選擇視窗，只有你選擇的欄位會被匯入，其他欄位例如時間戳記、Email、電話都不會使用。</p>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="showCsvColumnPicker"
      class="modal-backdrop csv-column-backdrop"
      @click.self="closeCsvColumnPicker"
    >
      <section
        class="modal-panel compact csv-column-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-column-title"
      >
        <header class="modal-header">
          <h2 id="csv-column-title">選擇姓名欄位</h2>
          <button type="button" class="icon-button" aria-label="關閉" @click="closeCsvColumnPicker">×</button>
        </header>

        <div class="csv-column-body">
          <p>請選擇要當作選手姓名與稱號的欄位，共 {{ csvRows.length }} 筆資料。有稱號的選手，對戰表會以稱號顯示。</p>

          <div class="csv-column-group">
            <strong class="csv-column-group-label">選手姓名（必選）</strong>
            <div class="csv-column-list" role="radiogroup" aria-label="姓名欄位">
              <button
                v-for="option in csvColumnOptions"
                :key="option.index"
                type="button"
                class="csv-column-option"
                :class="{ active: csvSelectedColumn === option.index }"
                role="radio"
                :aria-checked="csvSelectedColumn === option.index"
                @click="selectCsvNameColumn(option.index)"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.preview }}</span>
              </button>
            </div>
          </div>

          <div class="csv-column-group">
            <strong class="csv-column-group-label">稱號（可不選）</strong>
            <div class="csv-column-list" role="radiogroup" aria-label="稱號欄位">
              <button
                type="button"
                class="csv-column-option"
                :class="{ active: csvSelectedTitleColumn === -1 }"
                role="radio"
                :aria-checked="csvSelectedTitleColumn === -1"
                @click="selectCsvTitleColumn(-1)"
              >
                <strong>不使用稱號</strong>
                <span>對戰表一律顯示選手姓名</span>
              </button>
              <button
                v-for="option in csvColumnOptions"
                :key="option.index"
                type="button"
                class="csv-column-option"
                :class="{ active: csvSelectedTitleColumn === option.index }"
                :disabled="csvSelectedColumn === option.index"
                role="radio"
                :aria-checked="csvSelectedTitleColumn === option.index"
                @click="selectCsvTitleColumn(option.index)"
              >
                <strong>{{ option.label }}</strong>
                <span>{{ option.preview }}</span>
              </button>
            </div>
          </div>

          <ul v-if="csvColumnErrors.length" class="error-list">
            <li v-for="error in csvColumnErrors" :key="error">{{ error }}</li>
          </ul>

          <div class="csv-column-actions">
            <button type="button" class="secondary-action" @click="closeCsvColumnPicker">取消</button>
            <button type="button" class="primary-action" @click="confirmCsvColumn">匯入這個欄位</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
