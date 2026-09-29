import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { generateSysConfigSvg, parseSysConfig } from "../lib"

const outputDirectory = process.argv[2]
if (!outputDirectory) {
  throw new Error(
    "Usage: bun scripts/export-pedometer-preview.ts <output-directory>",
  )
}
const fixture = new URL(
  "../tests/fixtures/pedometer/pedometer.syscfg",
  import.meta.url,
)
const config = parseSysConfig(await Bun.file(fixture).text())
await mkdir(outputDirectory, { recursive: true })
await Bun.write(
  join(outputDirectory, "pedometer-preview.svg"),
  generateSysConfigSvg(config),
)
await Bun.write(
  join(outputDirectory, "pedometer.roundtrip.syscfg"),
  config.getString(),
)
