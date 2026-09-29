import type { SysConfigInspectionRow } from "../inspection/inspect-sysconfig"

const labels: Record<SysConfigInspectionRow["kind"], string> = {
  module: "MODULE",
  instance: "INSTANCE",
  assignment: "SETTING",
  fixed_assignment: "FIXED ($assign)",
  suggested_assignment: "SUGGESTION",
  declaration: "DECLARATION",
  call: "CALL (UNEVALUATED)",
  unknown_statement: "UNKNOWN STATEMENT",
}

function escapeSvgText(text: string): string {
  return text
    .toWellFormed()
    .replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;"
        case "<":
          return "&lt;"
        case ">":
          return "&gt;"
        case '"':
          return "&quot;"
        default:
          return "&apos;"
      }
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "\ufffd")
}

function wrapSource(source: string): string[] {
  return source.split(/\r\n|\r|\n/).flatMap((line) => {
    const characters = Array.from(line.replace(/\t/g, "    "))
    if (!characters.length) return [""]
    const lines: string[] = []
    // Fixed-width wrapping keeps long paths visible without truncating them.
    for (let start = 0; start < characters.length; start += 96) {
      lines.push(characters.slice(start, start + 96).join(""))
    }
    return lines
  })
}

export function renderInspectionRow(row: SysConfigInspectionRow, top: number) {
  const source = row.target ? `${row.target} = ${row.expression}` : row.expression
  const lines = wrapSource(source)
  const height = 48 + lines.length * 18
  const heading = `<text x="36" y="${top + 24}" font-weight="bold">${labels[row.kind]}</text>`
  const body = lines
    .map(
      (line, index) =>
        `<text xml:space="preserve" x="36" y="${top + 47 + index * 18}">${escapeSvgText(line)}</text>`,
    )
    .join("\n")
  return {
    height,
    svg: `<g><title>${escapeSvgText(source)}</title><rect x="24" y="${top}" width="852" height="${height}" fill="none" stroke="#ccc"/>${heading}\n${body}</g>`,
  }
}
