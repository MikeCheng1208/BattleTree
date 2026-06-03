# BattleTree 縱向比賽對戰表系統實作計劃

> 單淘汰賽對戰表產生器。版面縱向、由下往上收斂：第一輪在最底部，冠軍在最頂端。
> 純前端，資料存 `localStorage`，不建後端、不加路由。

---

## 1. 專案現況

- 專案是 Vite + Vue 3 單頁應用。
- 目前仍是 Vite/Vue 樣板：
  - `src/App.vue` 匯入並渲染 `src/components/HelloWorld.vue`。
  - `src/style.css` 仍是樣板樣式。
  - `README.md` 仍是 Vue 3 + Vite 樣板內容。
- `package.json` 目前只有 `vue`，尚未安裝 `@vueuse/core`、`html-to-image`、`gsap`。
- 專案目錄不是 git repository，本次實作前後無法用 `git diff` 檢查變更，需靠檔案檢查與 build 驗證。

---

## 2. 需要先確認的問題

這些問題不阻擋 MVP 實作，但會影響細節。若未回覆，先採用「預設決策」。

| 問題 | 預設決策 |
| --- | --- |
| 參賽人數上限要多少？ | 先做 2 至 64 人。64 人以上會讓縱向對戰表與匯出圖過大。 |
| 選手「編號」是否可重複？ | 不可重複。產生前驗證 seed 必須是 1 至 N 的唯一整數。 |
| `random` 模式重新抽籤後，是否保留已改過的姓名與編號？ | 保留 players，只重洗 `slots` 並清空 `results`。 |
| score 是否允許小數或負數？ | 不允許。只允許空值或 0 以上整數。 |
| 下載 JPG 是否只截對戰表，還是包含工具列與抽籤狀態？ | 只截對戰表區域，不包含工具列與 modal。 |
| 刪除目前唯一一張對戰表後要怎麼處理？ | 自動建立一張新的 setup 狀態對戰表並設為 current。 |
| localStorage schema 日後變更怎麼辦？ | 第一版加入 `version: 1`，讀取時遇到缺欄位做 normalize。 |
| 抽籤「全部」是否包含已抽出過的人？ | 重新確認名單時包含全部符合條件者；進入舞台後，抽出者會從當次 pool 移除。 |

---

## 3. 核心需求

1. 可新增、選取、刪除多張對戰表。
2. 可編輯比賽名稱。
3. 建立流程固定為：
   `選人數 -> 編輯每位對戰者姓名與編號 -> 選擇依序配對或隨機抽籤 -> 產生對戰表`
4. 非 2 次方人數自動補滿到 2 次方，並用標準 seeding 分散 bye。
5. 選手區塊顯示姓名、編號、win icon。
6. 點 win icon 可晉級，可選填比分；再點同一勝者可取消，且連鎖清除後續不成立的結果。
7. 對戰表縱向由下往上收斂，第一輪在底部，冠軍在頂部。
8. 工具列包含：新增、選取、刪除、抽籤、全螢幕、下載 JPG。
9. 抽籤功能為純展示，不回寫對戰表：
   - 條件：全部、第一輪敗者、第二輪敗者等。
   - 先列出名單確認。
   - 一次抽一位，抽中者從籤筒移除。
   - 名字輪播閃爍並逐漸減速後揭曉。

---

## 4. 技術選型

- Vue 3 + Composition API + `<script setup>`。
- `@vueuse/core`
  - `useStorage`：localStorage 響應式持久化。
  - `useFullscreen`：對戰表容器全螢幕。
  - `useResizeObserver`：對戰表尺寸改變時重算連線。
- `html-to-image`
  - 使用 `toJpeg` 匯出對戰表 DOM。
- `gsap`
  - 抽籤輪播、揭曉、彈窗進出、勝者高亮等動畫都使用 GSAP。

安裝指令：

```bash
npm install @vueuse/core html-to-image gsap
```

驗證指令：

```bash
npm run build
npm run dev
```

---

## 5. 資料模型

由 `src/composables/useBrackets.js` 管理。

localStorage keys：

- `battletree:brackets`：`Record<string, Bracket>`
- `battletree:currentId`：目前開啟的對戰表 id

`Bracket` 結構：

```js
{
  version: 1,
  id: string,
  name: string,
  createdAt: number,
  updatedAt: number,
  status: 'setup' | 'ready',

  players: [
    { id: string, name: string, seed: number }
  ],
  pairingMode: 'order' | 'random',

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
    pool: string[],
    drawn: string[]
  }
}
```

資料不變量：

- `players.length` 必須介於 2 至 64。
- `players[].seed` 必須是 1 至 N 的唯一整數。
- `bracketSize` 必須是大於等於 `players.length` 的最小 2 次方。
- `slots.length === bracketSize`。
- `slots` 只能包含現有 player id 或 `null`。
- `results` 只保存使用者手動輸入的結果；bye 自動晉級不寫入 `results`。
- 修改 players、seed、pairingMode 後，如果已產生對戰表，需提示並重新產生，避免舊 `slots/results` 與名單不一致。

---

## 6. 對戰表演算法

檔案：`src/composables/useBracketEngine.js`。

### 6.1 bracketSize

UI 限制最少 2 人，因此 engine 仍做防禦式處理：

```js
function getBracketSize(count) {
  if (count <= 2) return 2
  return 2 ** Math.ceil(Math.log2(count))
}
```

### 6.2 標準種子序列

使用遞迴 seeding order 分散強種子與 bye。

```js
size 2 -> [1, 2]
size 4 -> [1, 4, 3, 2]
size 8 -> [1, 8, 5, 4, 3, 6, 7, 2]
```

規則：

```js
seeds(n) = seeds(n / 2).flatMap(seed => [seed, n + 1 - seed])
```

產生 slots：

- order：依 `seed` 升冪排序 players，填入第 1 至 N 種子。
- random：先 Fisher-Yates 洗牌 players，再填入第 1 至 N 種子。
- 超過 players.length 的種子填 `null`。

### 6.3 rounds 推導

不要把 rounds 存進 localStorage。每次由 `slots + results` 推導。

matchId 格式：

```js
`r${roundIndex}-m${matchIndex}`
```

roundIndex 從 0 開始，`rounds[0]` 是第一輪。

每場 match：

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
  isBye,
  isPlayable
}
```

晉級規則：

- A 是 player、B 是 `null`：A 自動晉級，不顯示 win icon。
- B 是 player、A 是 `null`：B 自動晉級，不顯示 win icon。
- A/B 都是 player：依 `results[matchId].winnerSlot` 決定。
- A/B 其中一方尚未從前輪產生：此場不可點擊。

### 6.4 連鎖清除

取消或改變某場勝者時，必須清除所有上游依賴結果。

做法：

1. 刪除目前 match 的 result。
2. 重新推導 rounds。
3. 從下一輪開始檢查既有 results：若 result 指向的 player 不再存在於該 match 的 A/B，刪除該 result。
4. 重複直到沒有不合法 result。

### 6.5 敗者名單

供抽籤使用：

```js
getLosersByRound(bracket, roundIndex): string[]
getRoundLabels(bracket): { value: `loser-r${number}`, label: string }[]
```

規則：

- 只計入 A/B 都是 player 且已有 winner 的 match。
- bye 場與未分勝負場不產生敗者。
- `all` 永遠是所有 players。

---

## 7. 元件拆分

```txt
src/
├─ App.vue
├─ components/
│  ├─ Toolbar.vue
│  ├─ BracketSetup.vue
│  ├─ BracketView.vue
│  ├─ MatchCard.vue
│  ├─ PlayerSlot.vue
│  ├─ BracketListModal.vue
│  ├─ ScorePopover.vue
│  └─ LotteryModal.vue
├─ composables/
│  ├─ useBrackets.js
│  ├─ useBracketEngine.js
│  ├─ useBracketExport.js
│  └─ useLottery.js
└─ style.css
```

職責：

- `App.vue`：初始化 store、顯示 Toolbar、setup/ready 切換、modal 開關、可編輯比賽名稱。
- `Toolbar.vue`：新增、選取、刪除、抽籤、全螢幕、下載。
- `BracketSetup.vue`：人數、姓名、編號、配對方式、產生對戰表。
- `BracketView.vue`：渲染縱向對戰表、SVG 連線、比分標籤、random 重新抽籤。
- `MatchCard.vue`：單場對戰與 win icon 互動。
- `PlayerSlot.vue`：選手顯示、勝者/可點/disabled 狀態。
- `ScorePopover.vue`：可選比分輸入。
- `BracketListModal.vue`：既有對戰表列表、切換、刪除。
- `LotteryModal.vue`：抽籤三步流程與舞台動畫。

---

## 8. 版面與互動設計

### 8.1 對戰表

- 使用縱向 layout，但 DOM 順序建議由冠軍到第一輪，視覺上第一輪在底部。
- 每一輪是一列，卡片水平方向用 grid 或 flex 分散。
- 父 match 需置中於兩個子 match 的中間。
- SVG overlay 畫子卡到父卡的連線。
- 每次視窗 resize、卡片尺寸變化、結果變化後重算連線。

### 8.2 卡片

- 未決定勝者：兩邊都可點 win icon。
- 已決定勝者：勝者高亮，敗者降噪。
- 再點同一勝者：取消該場結果。
- 點另一位選手：改勝者，並清除後續不合法結果。
- score 可留空；只在 A/B 至少一個有值時顯示比分。

### 8.3 抽籤

流程：

1. 選條件。
2. 顯示名單與人數，確認後才建立 pool。
3. 舞台顯示剩餘名單與已抽出名單。
4. 按抽一位後，先決定 winner，再用 GSAP 做表演動畫。
5. 動畫期間鎖住按鈕。
6. 動畫完成後才從 pool 移除 winner 並加入 drawn。

GSAP 清理：

- `useLottery` 需保存 timeline ref。
- modal 關閉或 component unmount 時執行 `timeline.kill()`。
- 不使用 CSS keyframes 做抽籤主動畫。

---

## 9. 工具列功能

| 功能 | 行為 |
| --- | --- |
| 新增對戰表 | 建立 setup 狀態 Bracket，設為 current。 |
| 選取之前的對戰表 | 開啟列表 modal，點選後切換 currentId。 |
| 刪除對戰表 | confirm 後刪除；若刪到沒有任何對戰表，自動建立新表。 |
| 抽籤 | 開 LotteryModal。setup 階段若已有 players，也可抽全部；ready 階段可抽敗者。 |
| 全螢幕 | 對 `BracketView` 容器使用 `useFullscreen` toggle。 |
| 下載 JPG | 用 `html-to-image` 匯出 `BracketView` 容器，檔名使用 sanitized bracket name。 |

---

## 10. 實作順序

1. 安裝相依：`@vueuse/core`、`html-to-image`、`gsap`。
2. 建立 `useBracketEngine.js`，先完成純函式與基本測試資料。
3. 建立 `useBrackets.js`，處理 CRUD、currentId、normalize、updatedAt。
4. 改 `App.vue`，移除樣板 HelloWorld 入口。
5. 建立 `BracketSetup.vue`，完成建立流程與驗證。
6. 建立 `BracketView.vue`、`MatchCard.vue`、`PlayerSlot.vue`，完成晉級與取消。
7. 加入 SVG 連線與比分顯示。
8. 建立 `Toolbar.vue`、`BracketListModal.vue`、`useBracketExport.js`。
9. 建立 `useLottery.js`、`LotteryModal.vue` 與 GSAP 動畫。
10. 重寫 `src/style.css` 與 `index.html` title。
11. 更新 `README.md`，移除 Vue/Vite 樣板說明。
12. 執行 build 與瀏覽器手動驗收。

---

## 11. 需要修改或新增的檔案

- 修改 `package.json`、`package-lock.json`。
- 修改 `index.html`。
- 修改 `README.md`。
- 修改 `src/App.vue`。
- 修改 `src/style.css`。
- 可保留或刪除 `src/components/HelloWorld.vue`；若不再使用，建議刪除。
- 新增 `src/components/Toolbar.vue`。
- 新增 `src/components/BracketSetup.vue`。
- 新增 `src/components/BracketView.vue`。
- 新增 `src/components/MatchCard.vue`。
- 新增 `src/components/PlayerSlot.vue`。
- 新增 `src/components/ScorePopover.vue`。
- 新增 `src/components/BracketListModal.vue`。
- 新增 `src/components/LotteryModal.vue`。
- 新增 `src/composables/useBrackets.js`。
- 新增 `src/composables/useBracketEngine.js`。
- 新增 `src/composables/useBracketExport.js`。
- 新增 `src/composables/useLottery.js`。

---

## 12. 驗收清單

### 建立流程

- 可新增 setup 對戰表。
- 可修改比賽名稱。
- 可設定 2 至 64 人。
- 人數變更時自動產生 Player1 至 PlayerN。
- seed 不可空白、不可重複、不可超出 1 至 N。
- 選 order 後照 seed 配對。
- 選 random 後洗牌配對。

### 對戰表

- 8 人產生 4 場第一輪，第一輪在底部，冠軍在頂部。
- 6 人補成 8 格，2 個 bye 分散，高種子自動晉級。
- bye 場不顯示 win icon。
- 可點 win icon 晉級。
- 可不輸入比分直接晉級。
- 可輸入比分並顯示在線上。
- 再點同一勝者可取消。
- 改變前輪勝者會清除後續不合法結果。
- random 模式可重新抽籤，重洗 slots 並清空 results。

### 持久化與 CRUD

- 重新整理後目前對戰表可還原。
- 可切換既有對戰表。
- 可刪除對戰表。
- 刪除最後一張後會建立新 setup 對戰表。

### 抽籤

- 未開賽時只有「全部」可用。
- 有敗者後才出現「第 N 輪敗者」。
- 確認名單顯示姓名、編號、人數。
- 抽一位有 GSAP 輪播閃爍、逐漸減速、定格揭曉。
- 抽中者從 pool 移除並加入 drawn。
- pool 空時抽一位 disabled。
- 重置抽籤會回到選條件。

### 匯出與全螢幕

- 全螢幕可進出。
- JPG 下載成功。
- JPG 包含對戰表、連線、比分，不包含 modal。
- 縮放視窗後連線重新對齊。

### 品質

- `npm run build` 通過。
- console 無明顯錯誤。
- modal 關閉與 component unmount 後無殘留 GSAP timeline。
- localStorage 壞資料或舊資料不會讓畫面崩潰，會 normalize 或建立新表。

---

## 13. 風險與補強

- **連線對齊風險**：卡片高度會因姓名長度、比分、響應式改變。需統一在 `nextTick` 後量測，並用 `ResizeObserver` 觸發重算。
- **匯出風險**：`html-to-image` 對字體、背景、SVG overlay 可能有差異。需指定 `backgroundColor`，避免透明背景。
- **資料一致性風險**：取消或改勝者時若不清後續結果，會出現不存在的晉級者。需把連鎖清除當成 engine 純函式處理。
- **抽籤公平性風險**：動畫不可決定結果。需先用亂數決定 winner，再讓動畫落到該 winner。
- **大型 bracket 風險**：64 人時畫面和 JPG 都很大。需讓對戰表容器可水平/垂直捲動，避免壓縮到不可讀。

---

## 14. 非本次範圍

- 雙敗淘汰。
- 季軍賽。
- 後端儲存與分享連結。
- PDF 匯出。
- 拖曳調整對戰。
- 多國語系。
