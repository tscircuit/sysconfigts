# Inspect and preview a SysConfig document

```ts
import {
  generateSysConfigSvg,
  inspectSysConfig,
  parseSysConfig,
} from "sysconfigts"

const config = parseSysConfig(await Bun.file("pedometer.syscfg").text())
console.log(inspectSysConfig(config))
await Bun.write("pedometer-preview.svg", generateSysConfigSvg(config))
```

Both APIs accept an existing `SysConfig`, including a document constructed in
TypeScript. They have no filesystem, Circuit JSON, browser, or TI dependency.
`generateSysConfigSvg()` returns a standalone SVG string with fixed-width text
wrapping and escaped XML. It never embeds source as executable SVG markup.
The output is deterministic for a given document, suitable for snapshots and CI
artifacts. See the compact [example snapshot](../tests/fixtures/preview.svg).

`inspectSysConfig()` returns ordered `{ kind, target, expression }` rows. Trivia
is omitted, but repeated assignments are retained. `$assign` is labeled
`fixed_assignment`; `$suggestSolution` is `suggested_assignment`. Modules,
instances, declarations, calls, and unknown statements remain distinguishable.
Static paths are rendered canonically without resolving aliases. Expressions
are shown as source; neither API edits the document or computes effective values.

**This is a source preview, not a physical pinout or TI validation result.**
Assignments inside unsupported control flow remain visible as unknown source,
not extracted as unconditional settings. Calls, expressions, and SDK defaults
are not evaluated. Even a literal `$assign` is only a textual request until TI
resolves the configuration. Use TI's matching SDK/tool and generated outputs
for independent hardware validation; visual equality does not establish it.

The [pedometer fixture notes](../tests/fixtures/pedometer/README.md) describe the
supplied CC2340 configuration, transcription provenance, and pending TI checks.
To create its preview from a checkout, use that fixture's path in the example
above. There is no checked-in TI-generated result for it yet.
