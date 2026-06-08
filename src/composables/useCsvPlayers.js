const NAME_COLUMN = '姓名'

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

export function parseCsvPlayerNames(text, nameColumn = NAME_COLUMN) {
  const normalizedText = text.replace(/^\uFEFF/, '')
  const rows = parseCsvRows(normalizedText)
  const header = rows[0]?.map((cell) => cell.trim()) ?? []
  const nameIndex = header.indexOf(nameColumn)

  if (nameIndex === -1) {
    return {
      names: [],
      errors: [`找不到姓名欄位，請確認 CSV 標題為「${nameColumn}」`],
    }
  }

  const names = rows
    .slice(1)
    .map((row) => row[nameIndex]?.trim() ?? '')
    .filter(Boolean)

  if (!names.length) {
    return {
      names,
      errors: ['CSV 中沒有可匯入的姓名'],
    }
  }

  if (names.length < 2) {
    return {
      names,
      errors: ['至少需要 2 位參賽者'],
    }
  }

  return { names, errors: [] }
}
