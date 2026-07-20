<script setup>
import { computed, ref, watch } from 'vue'
import csvHelpOpenSheet from '../assets/01-打開試算表.png'
import csvHelpNameColumn from '../assets/02-確認一定欄位名稱要是姓名.png'
import csvHelpDownloadCsv from '../assets/03-匯出csv.png'
import { FORMAT_OPTIONS } from '../constants/bracketOptions'
import { extractPlayerEntries, parseCsvTable } from '../composables/useCsvPlayers'
import {
  FREE_SLOT_COUNT_OPTIONS,
  getFirstRoundPreview,
  normalizeFreeSlotCount,
  validatePlayers,
} from '../composables/useBracketEngine'
import { getPrelimPlan, PRELIM_GROUP_SIZE_OPTIONS } from '../composables/usePrelimEngine'

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
  'set-format',
  'set-prelim-group-size',
  'set-free-slot-count',
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
const effectiveFreeSlotCount = computed(() =>
  normalizeFreeSlotCount(props.bracket.freeSlotCount, props.bracket.players.length),
)
const previewIsError = computed(
  () => props.bracket.format === 'free' && props.bracket.players.length > 64,
)
const firstRoundPreviewText = computed(() => {
  const total = props.bracket.players.length
  if (total < 2) return ''
  if (props.bracket.format === 'prelim') {
    if (total < 3) return '預賽模式至少需要 3 位參賽者'
    const plan = getPrelimPlan(total, props.bracket.prelimGroupSize)
    const sizeCounts = new Map()
    plan.groupSizes.forEach((size) => sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1))
    const sizeSummary = [...sizeCounts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([size, count]) => `${size} 人×${count} 組`)
      .join('、')
    return `${total} 人：預賽 ${plan.groupCount} 組循環（${sizeSummary}）共 ${plan.matchCount} 場、每人至少打 ${plan.minMatchesPerPlayer} 場 → ${plan.knockoutSize} 強淘汰賽（零輪空）`
  }
  if (props.bracket.format === 'free') {
    if (total > 64) return `自由編排最多 64 格，目前 ${total} 人超出上限，請減少參賽人數`
    const slotCount = effectiveFreeSlotCount.value
    const emptyCount = slotCount - total
    return emptyCount
      ? `${total} 人排入 ${slotCount} 格：${emptyCount} 格空位待填（可於對戰頁填人、確認輪空，或讓第一輪敗者再戰）`
      : `${total} 人剛好填滿 ${slotCount} 格，無空位`
  }
  const { slotCount, groups } = getFirstRoundPreview(total, props.bracket.groupCount)
  if (groups.length === 1) {
    const [group] = groups
    const byeText = group.byeCount ? `${group.byeCount} 人輪空晉級` : '無人輪空'
    return `${total} 人開 ${slotCount} 格：第一輪 ${group.matchCount} 場對戰、${byeText}`
  }
  const parts = groups.map((group) =>
    group.playerCount
      ? `${group.label} 組 ${group.playerCount} 人（${group.matchCount} 場對戰、${group.byeCount} 人輪空）`
      : `${group.label} 組 0 人`,
  )
  return `${total} 人分 ${groups.length} 組、每組 ${slotCount} 格：${parts.join('、')}`
})

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

    <div class="field setup-format-field">
      <span>賽制</span>
      <div class="format-card-grid" role="radiogroup" aria-label="賽制">
        <button
          v-for="option in FORMAT_OPTIONS"
          :key="option.value"
          type="button"
          class="format-card"
          :class="{ active: bracket.format === option.value }"
          role="radio"
          :aria-checked="bracket.format === option.value"
          @click="emit('set-format', option.value)"
        >
          <strong>{{ option.label }}</strong>
          <p>{{ option.description }}</p>
        </button>
      </div>
    </div>

    <div class="field setup-control-card format-settings-card">
      <template v-if="bracket.format === 'prelim'">
        <span>預賽每組人數</span>
        <div class="segmented group-count-control" role="radiogroup" aria-label="預賽每組人數">
          <button
            v-for="size in PRELIM_GROUP_SIZE_OPTIONS"
            :key="size"
            type="button"
            :class="{ active: bracket.prelimGroupSize === size }"
            @click="emit('set-prelim-group-size', size)"
          >
            約 {{ size }} 人
          </button>
        </div>
        <p class="format-settings-hint">
          各組打完循環賽後，第 1 名（不足時補成績最佳的第 2 名）晉級淘汰賽。
        </p>
      </template>
      <template v-else-if="bracket.format === 'free'">
        <span>對戰格數</span>
        <div class="segmented group-count-control free-slot-count-control" role="radiogroup" aria-label="對戰格數">
          <button
            v-for="count in FREE_SLOT_COUNT_OPTIONS"
            :key="count"
            type="button"
            :class="{ active: effectiveFreeSlotCount === count }"
            :disabled="count < bracket.players.length"
            @click="emit('set-free-slot-count', count)"
          >
            {{ count }} 格
          </button>
        </div>
        <p class="format-settings-hint">
          名單先排入且左右平均分佈；空格待填的對戰顯示「待定」，可於對戰頁填人或確認輪空。
        </p>
      </template>
      <template v-else>
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
        <p class="format-settings-hint">
          分組後各組先各自打出冠軍，再進入總決賽區交叉對戰。
        </p>
      </template>
    </div>

    <section class="setup-participants">
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

        <div class="field setup-control-card pairing-card">
          <span>配對方式</span>
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
          <button
            type="button"
            class="secondary-action shuffle-seeds-button"
            @click="emit('shuffle-player-seeds')"
          >
            隨機重排編號
          </button>
        </div>
      </div>

      <ul v-if="importErrors.length" class="error-list">
        <li v-for="error in importErrors" :key="error">{{ error }}</li>
      </ul>
      <p v-else-if="importSummary" class="import-summary">{{ importSummary }}</p>

      <p v-if="firstRoundPreviewText" class="first-round-preview" :class="{ error: previewIsError }">
        {{ firstRoundPreviewText }}
      </p>

      <ul v-if="submitErrors.length" class="error-list">
        <li v-for="error in submitErrors" :key="error">{{ error }}</li>
      </ul>

      <button type="button" class="primary-action" :disabled="previewIsError" @click="generate">
        產生對戰表
      </button>

      <div class="player-editor-toolbar">
        <div>
          <strong>參賽名單</strong>
          <span>移除會保留原編號，需要時再手動重新排序。有填稱號的選手，對戰表會顯示稱號。</span>
        </div>
        <button type="button" class="secondary-action reseed-button" @click="emit('reorder-player-seeds')">
          重新排序參賽編號
        </button>
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

      <div class="setup-bottom-actions">
        <button type="button" class="secondary-action add-player-button" @click="emit('add-player')">
          +1 新增參賽者
        </button>
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
