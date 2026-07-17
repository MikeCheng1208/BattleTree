const NAME_COLUMN = '姓名'
const TITLE_COLUMN = '稱號'

export function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (inQuotes) throw new Error('CSV 格式錯誤：引號未正確關閉')
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export function parseCsvTable(text) {
  const normalizedText = text.replace(/^\uFEFF/, '')
  const rows = parseCsvRows(normalizedText)
  const header = rows[0]?.map((cell) => cell.trim()) ?? []

  if (!header.length) {
    return { header: [], rows: [], defaultColumnIndex: -1, defaultTitleColumnIndex: -1, errors: ['CSV 內容是空的'] }
  }

  const dataRows = rows.slice(1)

  if (!dataRows.length) {
    return { header, rows: [], defaultColumnIndex: -1, defaultTitleColumnIndex: -1, errors: ['CSV 中沒有可匯入的資料'] }
  }

  return {
    header,
    rows: dataRows,
    defaultColumnIndex: header.indexOf(NAME_COLUMN),
    defaultTitleColumnIndex: header.indexOf(TITLE_COLUMN),
    errors: [],
  }
}

export function extractPlayerEntries(rows, nameIndex, titleIndex = -1) {
  const entries = rows
    .map((row) => ({
      name: row[nameIndex]?.trim() ?? '',
      title: titleIndex >= 0 ? row[titleIndex]?.trim() ?? '' : '',
    }))
    .filter((entry) => entry.name)

  if (!entries.length) {
    return {
      entries,
      errors: ['這個欄位沒有可匯入的姓名'],
    }
  }

  if (entries.length < 2) {
    return {
      entries,
      errors: ['至少需要 2 位參賽者'],
    }
  }

  return { entries, errors: [] }
}
