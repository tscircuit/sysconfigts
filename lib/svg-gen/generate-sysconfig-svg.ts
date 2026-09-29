import { inspectSysConfig } from "../inspection/inspect-sysconfig"
import type { SysConfig } from "../sysconfig"
import { renderInspectionRow } from "./render-inspection-row"

/** Source preview only. This neither executes scripts nor verifies TI pins. */
export function generateSysConfigSvg(config: SysConfig): string {
  const rows = inspectSysConfig(config)
  const groups: string[] = []
  let top = 112
  for (const row of rows) {
    const rendered = renderInspectionRow(row, top)
    groups.push(rendered.svg)
    top += rendered.height + 12
  }
  if (!rows.length) {
    groups.push(
      '<text x="24" y="136">No statements. The source is empty or contains only comments.</text>',
    )
    top = 166
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${top + 24}" viewBox="0 0 900 ${top + 24}" role="img" aria-labelledby="preview-title preview-description">`,
    '<title id="preview-title">SysConfig source preview</title>',
    '<desc id="preview-description">Ordered textual settings. Suggestions are not fixed assignments. Calls, expressions and SDK defaults are not evaluated. Not TI validation.</desc>',
    '<rect width="100%" height="100%" fill="white"/>',
    '<g font-family="monospace" font-size="13" fill="#20252b">',
    '<text x="24" y="34" font-size="22" font-weight="bold">SysConfig source preview</text>',
    '<text x="24" y="62">Explicit source order, including repeated assignments. No script or SDK evaluation.</text>',
    '<text x="24" y="84">Not a resolved pinout or TI validation result.</text>',
    ...groups,
    "</g></svg>",
    "",
  ].join("\n")
}
