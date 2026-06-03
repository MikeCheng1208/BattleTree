# BattleTree

BattleTree 是一個縱向單淘汰賽對戰表產生器。使用者可以建立多份對戰表、編輯參賽選手、依編號或隨機抽籤產生賽程，並在瀏覽器中記錄勝負與比分。

對戰表採用「第一輪在底部、冠軍在頂部」的樹狀視覺呈現，適合用在桌遊、卡牌、電競、社團活動或小型賽事的現場賽程管理。

## 功能特色

- 建立、切換、刪除多份對戰表
- 支援 2 至 64 位參賽者
- 自動補齊 2 的次方賽程大小，未滿位時產生 bye
- 依選手編號排位或隨機抽籤排位
- 重新抽籤並清空既有比賽結果
- 點選選手即可標記勝方並推進下一輪
- 已產生勝方的比賽可輸入比分
- 自動顯示冠軍
- 對戰表可拖曳平移、縮放、重置、適合畫面
- 支援全螢幕檢視
- 支援下載 JPG 圖片
- 內建抽籤展示功能，可從全部選手或指定輪次敗者中抽出名單
- 使用 localStorage 儲存資料，重新整理後仍會保留對戰表

## 技術棧

- Vue 3
- Vite
- @vueuse/core
- GSAP
- html-to-image

## 快速開始

請先確認本機已安裝 Node.js 與 npm。

```bash
npm install
npm run dev
```

啟動後依照終端機顯示的 Vite URL 開啟瀏覽器，通常會是：

```text
http://localhost:5173/
```

## 可用指令

```bash
npm run dev
```

啟動本機開發伺服器。

```bash
npm run build
```

建立正式版輸出，輸出目錄為 `dist/`。

```bash
npm run preview
```

預覽正式版建置結果。請先執行 `npm run build`。

## 使用流程

1. 在上方工具列輸入比賽名稱。
2. 設定參賽人數，範圍為 2 至 64 人。
3. 編輯每位選手的編號與姓名。
4. 選擇配對方式：
   - `依序配對`：依照選手編號排序後產生種子排位。
   - `隨機抽籤`：先打亂選手，再套用賽程排位。
5. 點選「產生對戰表」。
6. 在對戰表中點選選手名稱標記勝方。
7. 勝方產生後，可在該場比賽輸入比分。
8. 需要輸出時，可使用「全螢幕」或「下載 JPG」。

## 抽籤功能

工具列的「抽籤」會開啟抽籤展示視窗。

可抽籤的名單來源包含：

- 全部選手
- 已有結果的指定輪次敗者

抽籤前需要先確認名單。開始後可以逐一抽出選手，已抽出的選手會從剩餘名單中移除，並顯示在「已抽出」清單中。

## 對戰表規則

- 目前支援單淘汰賽制。
- 參賽人數不必剛好是 2 的次方。
- 系統會將賽程大小補齊到下一個 2 的次方，例如 9 人會產生 16 人表。
- 空位會視為 bye，選手會自動晉級。
- 修改選手資料或配對方式後，已產生的對戰表會回到設定狀態，並清空既有賽果。
- 變更某一輪勝方時，後續輪次的結果會被清除，避免晉級資料不一致。

## 資料儲存

BattleTree 不需要後端服務。對戰表資料會儲存在瀏覽器的 localStorage 中：

- `battletree:brackets`：所有對戰表資料
- `battletree:currentId`：目前選取的對戰表 ID

因此資料只存在目前瀏覽器與目前網域中。若清除瀏覽器資料、更換瀏覽器或更換裝置，既有對戰表不會自動同步。

## 專案結構

```text
.
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   │   ├── hero.png
│   │   ├── vite.svg
│   │   └── vue.svg
│   ├── components/
│   │   ├── BracketListModal.vue
│   │   ├── BracketSetup.vue
│   │   ├── BracketView.vue
│   │   ├── LotteryModal.vue
│   │   ├── MatchCard.vue
│   │   ├── PlayerSlot.vue
│   │   ├── ScorePopover.vue
│   │   └── Toolbar.vue
│   ├── composables/
│   │   ├── useBracketEngine.js
│   │   ├── useBracketExport.js
│   │   ├── useBrackets.js
│   │   ├── useLottery.js
│   │   └── usePanZoom.js
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## 核心模組說明

- `src/App.vue`：應用程式主入口，串接工具列、設定頁、對戰表、列表彈窗與抽籤彈窗。
- `src/components/BracketSetup.vue`：參賽人數、選手資料與配對方式設定。
- `src/components/BracketView.vue`：對戰表畫布、連線、縮放、拖曳與冠軍顯示。
- `src/components/MatchCard.vue`：單場比賽卡片，負責勝方選取與比分入口。
- `src/components/LotteryModal.vue`：抽籤展示介面。
- `src/composables/useBracketEngine.js`：賽程大小、種子排序、bye、晉級、冠軍與賽果清理等核心邏輯。
- `src/composables/useBrackets.js`：對戰表 CRUD、localStorage 儲存、選手更新與賽果更新。
- `src/composables/useBracketExport.js`：全螢幕與 JPG 匯出。
- `src/composables/useLottery.js`：抽籤名單、動畫狀態與抽出結果管理。
- `src/composables/usePanZoom.js`：對戰表平移與縮放操作。

## 建置輸出

正式版建置會由 Vite 產生靜態檔案：

```bash
npm run build
```

完成後可將 `dist/` 部署到任何靜態網站服務，例如 Nginx、Netlify、Vercel 或 GitHub Pages。

## 注意事項

- 目前沒有帳號系統、伺服器同步或多人協作功能。
- JPG 匯出會以目前對戰表畫布為來源，並使用 2 倍 pixel ratio 輸出。
- 全螢幕能力取決於瀏覽器是否支援 Fullscreen API。
- localStorage 容量有限，不適合儲存大量長期賽事資料。
