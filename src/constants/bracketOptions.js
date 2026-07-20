export const DEFAULT_BRACKET_FORMAT = 'free'

export const FORMAT_OPTIONS = [
  {
    value: 'free',
    label: '自由編排',
    description:
      '手動選 8／16／32／64 格，名單先排入、空格由主辦自由填人或確認輪空，也能讓第一輪敗者再戰一次。適合報名浮動、現場補位。',
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
