# BattleTree 目前架構與規格

> 本文件描述目前已實作的 BattleTree 規格，作為後續開發、測試與回歸檢查依據。

---

## 1. 專案定位

BattleTree 是純前端 Vue 3 單頁應用，用於建立與展示單淘汰賽對戰表。

目前範圍：

- 不建後端。
- 不做帳號與雲端同步。
- 對戰表資料存在 localStorage。
- 自訂 Logo / 背景圖存在 IndexedDB。
- 支援桌機與手機版響應式操作。

---

## 2. 技術選型

- Vue 3 + Composition API + `<script setup>`
- Vite
- `@vueuse/core`
  - localStorage 響應式儲存。
  - Fullscreen API。
  - ResizeObserver。
- `html-to-image`
  - JPG 匯出。
- `gsap`
  - 抽籤動畫。
- IndexedDB
  - 儲存自訂圖片 Blob。

驗證指令：

```bash
npm run build
```

---

## 3. 應用狀態

### 3.1 頁面狀態

localStorage key：

- `battletree:view`

值：

- `home`：顯示首頁。
- `app`：顯示主應用。

規格：

- 首次進入預設顯示首頁。
- 點擊「開始對戰」後進入主應用。
- 重新整理後保留目前所在頁面。
- Header Logo 點擊回首頁時，需彈窗詢問是否保留目前輸入內容。
- 不保留時重置目前對戰表。

### 3.2 主題狀態

localStorage key：

- `battletree:theme`

目前主題：

- `mono`：黑白灰。
- `inverse`：暗色模式。
- `steel`：冷藍。
- `forest`：森林。
- `copper`：赤銅。

主題入口：

- 首頁桌機右上角。
- 主應用 Header 最右側。

點擊入口開啟 `ThemePicker` 彈窗，不使用下拉選單。

---

## 4. 自訂圖片與背景規格

### 4.1 IndexedDB

DB：

- `battletree-images`

Object store：

- `images`

Keys：

- `custom-logo`
- `background-image`

儲存內容：

- 原始 `File/Blob`。
- 不轉 Base64。

顯示方式：

- App 啟動時讀取 IndexedDB。
- 使用 `URL.createObjectURL(blob)` 產生畫面可用 URL。
- 替換、移除或 unmount 時 revoke 舊 object URL。

### 4.2 上傳限制

- Logo 上限：2MB。
- 背景圖上限：6MB。
- 非圖片檔或超過限制時，在彈窗內顯示錯誤訊息。
- 選取圖片後需立即在彈窗預覽區顯示，不等待 IndexedDB 寫入完成。

### 4.3 Logo

- 自訂 Logo 只替換主應用 Header 左上角 Logo。
- 首頁 BattleTree Logo 永遠使用預設 `src/assets/logo.svg`。
- 暗色模式不可改變自訂 Logo 顏色。
- 自訂 Logo 不套用 invert / filter。

### 4.4 背景圖

localStorage key：

- `battletree:background-fit`

目前背景圖透明度：

- App 背景圖片層：50%。
- 對戰表 viewport 主題底色：30%。

背景圖呈現方式：

| 值 | 顯示名稱 | 規格 |
| --- | --- | --- |
| `contain` | 完整 | 前景使用 `contain` 完整顯示；底層同圖使用 `cover` 填滿、`center center`、`blur(6px)`。 |
| `cover-center` | 填滿 | `cover`，`center center`。 |
| `cover-top` | 靠上 | `cover`，`top center`。 |
| `actual` | 原始 | `auto`，`center center`。 |

背景層實作：

- `.app-shell::before`：只在 `contain` 模式放模糊延展底層。
- `.app-shell::after`：顯示實際背景圖。
- `.app-shell > *`：內容層 z-index 高於背景。

---

## 5. 對戰表資料模型

由 `src/composables/useBrackets.js` 管理。

localStorage keys：

- `battletree:brackets`
- `battletree:currentId`

`Bracket`：

```js
{
  version: 1,
  id: string,
  name: string,
  createdAt: number,
  updatedAt: number,
  status: 'setup' | 'ready',

  players: [
    {
      id: string,
      name: string,
      seed: number,
      registrationConfirmed: boolean
    }
  ],
  pairingMode: 'order' | 'random',
  groupCount: 1 | 2 | 4 | 8,
  repechage: {
    enabled: boolean,
    selectionMode: 'random' | 'manual',
    targets: RepechageTarget[],
    selectedPlayerIds: string[],
    matches: RepechageMatch[]
  },

  bracketSize: number,
  slots: (string | null)[],
  results: {
    [matchId: string]: {
      winnerSlot: 0 | 1 | null,
      scoreA: number | null,
      scoreB: number | null
    }
  },

  lottery: {
    poolFilter: 'all' | `loser-r${number}`,
    confirmed: boolean,
    excludedIds: string[],
    pool: string[],
    drawn: string[]
  }
}
```

特殊結果：

- `third-place`：第三名爭奪戰結果，來源為總決賽兩側來源場次的敗者。
- `repechage-${number}`：敗部復活安插資料，`entryPlayerId` 會補入對應 target。

資料規則：

- 預設參賽人數：4。
- 參賽人數最少 2，目前無 64 人上限。
- `seed` 由系統維護，UI 不可編輯。
- `seed` 必須是正整數且不可重複；移除參賽者後可暫時不連續。
- `registrationConfirmed` 由主辦單位手動切換，用於標記報名是否確認成功。
- 移除參賽者會刪除該列並保留剩餘參賽者原編號。
- 點擊「重新排序參賽編號」才會依目前名單順序重編 `seed`。
- `groupCount` 只允許 1、2、4、8，且不得超過 `Math.floor(players.length / 2)`。
- `bracketSize` 為產生後 slots 長度。
- 修改 players、移除參賽者、重新排序編號、pairingMode、groupCount 後，ready 對戰表回到 setup，並清空 slots/results。
- 敗部復活只修正同一支線原本會連續輪空兩次的情況；主辦可設定復活名額，第一輪敗者會被安插到第一輪後面的空位並一路往上打。

---

## 6. 對戰表演算法

檔案：

- `src/composables/useBracketEngine.js`

### 6.1 bracketSize

```js
function getBracketSize(count) {
  if (count <= 2) return 2
  return 2 ** Math.ceil(Math.log2(count))
}
```

### 6.2 相鄰配對

規則：

- `order`：依 `seed` 升冪排序後相鄰配對，例如 1 vs 2、3 vs 4。
- `random`：隨機組對首輪位置，並避免 `seed` 相差 1 的選手首輪對上；若條件不可行，保留目前找到的最低衝突安排。
- 未滿 2 次方的空位填 `null`，視為 bye。
- 空對空分支標記為 `isEmpty`，只保留版面結構，不顯示卡片，也不產生等待中的來源。
- 啟用敗部復活時，若某支線原本會連續輪空兩次，第一輪後面的空位可被復活者填入。

### 6.3 分組

`createGroupedSlots(players, pairingMode, groupCount)`：

- `groupCount <= 1`：產生單一對戰表。
- `groupCount > 1`：依選手順序切成多組，各組內使用相鄰配對。
- 每組補齊到各組所需的 2 次方 slot。
- 回傳總 slots 與 groups metadata。

groups metadata：

```js
{
  label: 'A',
  startSlot: number,
  slotCount: number,
  playerCount: number
}
```

### 6.4 rounds 推導

rounds 不存入 localStorage，每次由 `slots + results` 推導。

matchId：

```js
`r${roundIndex}-m${matchIndex}`
```

第三名爭奪戰使用固定 matchId：

```js
`third-place`
```

match 結構：

```js
{
  id,
  roundIndex,
  matchIndex,
  slotA,
  slotB,
  playerA,
  playerB,
  winnerId,
  result,
  isBye,
  isEmpty,
  isWaiting,
  isPlayable
}
```

第三名爭奪戰規則：

- 當總決賽兩側來源場次都已有敗者時，產生第三名爭奪戰。
- 第三名爭奪戰不參與主對戰樹連線，不影響冠軍戰晉級。
- 季軍戰與冠軍戰都有結果後，榮譽榜顯示冠軍、亞軍、季軍、第四名。
- 修改四強或更早結果時，既有季軍戰結果需要清除；只修改冠軍戰結果時保留季軍戰結果。

敗部復活規則：

- 設定頁與執行中皆可啟用敗部復活，並選擇 `random` 或 `manual`。
- 產生對戰表時依復活名額建立安插 targets；無連續輪空時 targets 為空。
- 執行中透過 `applyRepechageSettingsDuringMatch` 啟用/調整/停用：以 `analyzeRepechageInsertionTargets(bracket.slots, groupCount)` 就地補建 targets、不重生 slots，並以 `sanitizeResults` 連鎖清除因等待復活者而不再合法的下游成績（UI 會先預覽影響場數並確認）；復活相關場次開打後鎖定。
- 第一輪全部完成後，從第一輪敗者建立復活池。
- 每個 target 需要 1 位第一輪敗者安插。
- 隨機模式由系統抽選；手動模式由主辦指定精確人數。
- 安插後的主賽場次尚未有結果前可重新選擇；開賽後鎖定。
- 修改第一輪結果會清除復活名單與安插資料。
- 復活者直接進入主對戰樹，不再使用外掛復活賽分支。

### 6.5 連鎖清除

改變或取消某場勝者後，必須清除後續不合法 result。

規則：

- 若後續 result 指向的選手不再存在於該 match 的 A/B，刪除該 result。
- 若 `third-place` 的選手來源不再合法，刪除該 result。
- 重複檢查直到所有結果合法。

---

## 7. 元件職責

```text
src/
├─ App.vue
├─ components/
│  ├─ Toolbar.vue
│  ├─ ThemePicker.vue
│  ├─ BracketSetup.vue
│  ├─ BracketView.vue
│  ├─ MatchCard.vue
│  ├─ PlayerSlot.vue
│  ├─ ScorePopover.vue
│  ├─ BracketListModal.vue
│  └─ LotteryModal.vue
├─ composables/
│  ├─ useBrackets.js
│  ├─ useBracketEngine.js
│  ├─ useBracketExport.js
│  ├─ useImageStorage.js
│  ├─ useLottery.js
│  └─ usePanZoom.js
└─ style.css
```

職責：

- `App.vue`：全域狀態、頁面切換、主題、圖片、資料流與主要彈窗。
- `Toolbar.vue`：主應用工具列。
- `ThemePicker.vue`：風格設定、主題切換、圖片上傳與背景呈現模式。
- `BracketSetup.vue`：設定頁。
- `BracketView.vue`：對戰表視角、分組分頁、pan/zoom、SVG 連線。
- `MatchCard.vue`：單場比賽。
- `PlayerSlot.vue`：選手與晉級操作。
- `ScorePopover.vue`：比分輸入。
- `BracketListModal.vue`：對戰表列表。
- `LotteryModal.vue`：抽籤流程與展示。

---

## 8. UI 與響應式規格

### 8.1 首頁

- 顯示預設 BattleTree Logo。
- 中央顯示「開始對戰」按鈕。
- 桌機右上角顯示風格設定按鈕。
- 手機首頁隱藏風格設定按鈕。
- 點擊開始對戰有離場過渡動畫。

### 8.2 Header

- 左上角 Logo 使用預設 Logo 或自訂 Logo。
- 自訂 Logo 保持原色。
- 點 Logo 回首頁前需詢問是否保留內容。
- 工具列按鈕：新增、選取、刪除、抽籤、全螢幕、下載 JPG、風格設定。
- 風格設定按鈕位於最右側。
- 手機版使用收合選單。
- 手機版隱藏全螢幕與縮放百分比/縮放按鈕。

### 8.3 設定頁

- 內容寬度：900px。
- 與 Header 上方距離：30px。
- 比賽名稱位於設定區塊內，參賽人數上方。
- 支援匯入 CSV，固定讀取 `姓名` 欄位並覆蓋目前名單。
- CSV 匯入旁提供教學按鈕，點擊後開啟彈窗說明 Google 表單/試算表下載 CSV 流程。
- 編號不可編輯。
- 每列顯示編號、姓名、報名確認按鈕與移除按鈕。
- 報名確認按鈕使用綠色勾勾表示已確認。
- 移除按鈕會直接刪除該參賽者，剩餘列往上遞補但保留原編號。
- 提供「重新排序參賽編號」按鈕，點擊後才依目前列順序重新編號。
- 手機版選手列維持編號、姓名、確認、移除同一行，姓名欄佔主要寬度。

### 8.3.1 CSV 匯入

- 入口位於參賽人數欄位旁。
- 檔案 input 接受 `.csv,text/csv`。
- 第一列視為 header。
- 固定尋找 header 完全等於 `姓名` 的欄位。
- 匯入後覆蓋目前 players。
- seed 重新由 1 開始依序產生。
- 匯入後 ready 對戰表回到 setup，並清空 slots/results/lottery。
- 空白姓名列忽略。
- 少於 2 位有效姓名時顯示錯誤。
- 支援標準 CSV 雙引號、欄位內逗號、欄位內換行。
- 不匯入 email、電話、時間戳記或其他欄位。
- 匯入教學彈窗內容：
  - 從 Google 表單回覆點擊試算表圖示或「在試算表中查看」。
  - 在 Google 試算表點選「檔案」→「下載」→「逗號分隔值檔案 (.csv)」。
  - 回到 BattleTree 點擊「匯入 CSV」選擇檔案。

### 8.4 對戰表

視角：

- `標準`
- `橫向`
- `分組`

分組視角：

- 使用 tabs 顯示各組與總決賽。
- 預設若有分組，進入對戰表後使用分組視角。

背景：

- viewport 主題底色為 30% 透明。
- 自訂背景圖需從對戰表後方透出。

---

## 9. 抽籤規格

流程：

1. 設定抽籤來源。
2. 顯示名單預覽。
3. 每張卡右上角有勾選控制。
4. 預設全部勾選。
5. 取消勾選後卡片透明度降至 40%，並從本次抽籤 pool 移除。
6. 開始抽籤後不可更動名單。
7. 抽籤舞台使用華麗卡片動畫。
8. 抽中時顯示彩花。
9. 抽中者從 pool 移除並加入 drawn。

抽籤資料不回寫對戰表結果，只作展示。

---

## 10. 匯出與全螢幕

- 桌機顯示全螢幕與下載 JPG。
- 手機隱藏全螢幕。
- 全螢幕狀態提供右下角解除全螢幕 icon。
- JPG 匯出來源為對戰表 DOM，不包含工具列與 modal。
- 匯出使用 `html-to-image`。

---

## 11. 驗收清單

### 11.1 基本流程

- 首次進入顯示首頁。
- 點「開始對戰」進入設定頁。
- 重新整理後停留在目前頁面。
- 預設參賽人數是 4。
- 可設定 2 人以上參賽者。
- 可從 Google 試算表 CSV 匯入 `姓名` 欄，並覆蓋目前名單。
- CSV 缺少 `姓名` 欄時顯示錯誤。
- CSV 有效姓名少於 2 位時顯示錯誤。
- 編號不可編輯。
- 可切換報名確認狀態，且狀態會保存。
- 可移除參賽者，移除後剩餘參賽者原編號保留。
- 可點擊重新排序參賽編號，將目前名單重編為連續編號。
- 修改姓名可正常保存。
- 依序配對與隨機配對皆可產生對戰表。
- 10 人依序配對第一輪應為 1 vs 2、3 vs 4、5 vs 6、7 vs 8、9 vs 10。

### 11.2 分組與視角

- 可選不分組、2 組、4 組、8 組。
- 分組數不超過可用最大組數。
- 分組後預設使用分組視角。
- 分組視角使用 tabs 切換組別與總決賽。
- 標準與橫向視角不應重疊。

### 11.3 對戰結果

- bye 自動晉級。
- 可選勝者。
- 可修改勝者。
- 修改前輪勝者會清除後續不合法結果。
- 勝者選取不會自動 fitToView。
- 可輸入比分。
- 冠軍正確顯示。

### 11.4 圖片與風格

- 風格按鈕開啟彈窗。
- 彈窗遮罩覆蓋整個 viewport 並置中。
- 可切換主題。
- 可上傳 Logo，並立即在彈窗預覽。
- Logo 只替換 Header，不替換首頁。
- 暗色模式不改變自訂 Logo 顏色。
- Logo 超過 2MB 顯示錯誤。
- 可還原 Logo。
- 可上傳背景圖，並立即在彈窗預覽。
- 背景圖超過 6MB 顯示錯誤。
- 可移除背景圖。
- 背景圖模式切換後立即套用並持久化。
- `完整` 模式有模糊延展底層與完整前景。

### 11.5 抽籤

- 名單預覽可勾選/取消。
- 取消卡片透明度為 40%。
- 開始抽籤後不可更動名單。
- 抽中後有彩花動畫。
- pool 空時不能繼續抽。

### 11.6 響應式

- 手機工具列收合。
- 手機隱藏全螢幕與縮放百分比/縮放按鈕。
- 手機設定頁選手列維持編號與姓名同一行。
- 手機抽籤大卡片不被裁切。

### 11.7 品質

- `npm run build` 通過。
- Console 不應有 BattleTree app 自身錯誤。
- 瀏覽器 extension 的 `contentscript.js` warning 不列入 app 錯誤。
- IndexedDB 讀寫失敗需顯示可理解錯誤，不應讓 app crash。

---

## 12. 已知限制

- 沒有後端同步。
- 沒有分享連結。
- 沒有雙敗淘汰。
- 沒有 PDF 匯出。
- 圖片儲存在單一瀏覽器 IndexedDB，清除瀏覽器資料後會消失。
- 大量參賽者仍可能造成 DOM 與匯出效能壓力。
