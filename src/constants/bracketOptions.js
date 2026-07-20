export const DEFAULT_BRACKET_FORMAT = 'free'

export const FORMAT_OPTIONS = [
  {
    value: 'free',
    label: '自由編排',
    description:
      '手動選 8／16／24／32／48／64 格，24／48 格會淘汰至三強後循環排名；空格可自由填人、確認輪空，也能讓第一輪敗者再戰。',
  },
  {
    value: 'single',
    label: '單淘汰',
    description: '所有人直接進入淘汰樹，輸一場即淘汰；人數不足 2 次方時自動輪空。節奏最快，適合一般賽事。',
  },
  {
    value: 'prelim',
    label: '預賽＋淘汰',
    description: '先分組循環累積戰績，各組前段名次晉級固定規模淘汰賽，每人保證多打幾場。適合中大型活動。',
  },
]
