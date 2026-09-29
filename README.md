# sysconfigts

Parse, inspect, edit, and serialize Texas Instruments SysConfig (`.syscfg`) files
in TypeScript, without executing the scripts or requiring an installed TI SDK.

This is an initial parser/serializer foundation for testing SysConfig
configurations. It follows the tscircuit handbook's
[parser library guidelines](https://github.com/tscircuit/handbook/blob/main/guides/ts-parser-libraries.md)
and [repository bootstrap guide](https://github.com/tscircuit/handbook/blob/main/guides/bootstrapping-repos.md).

## Install

```sh
bun add github:tscircuit/sysconfigts
```

The package exposes TypeScript from `lib/index.ts` directly, following the
handbook's preferred GitHub installation convention. Use Bun or a TypeScript-aware
bundler. There is no build step or npm release workflow.

## Parse, inspect, edit, serialize

```ts
import { parseSysConfig, SysConfigLiteral } from "sysconfigts"

const config = parseSysConfig(await Bun.file("board.syscfg").text())

for (const module of config.modules) {
  console.log(module.name, module.modulePath)
}

const baudRate = config.getAssignment("uart1.baudRate")?.value
if (baudRate instanceof SysConfigLiteral) {
  console.log(baudRate.value)
}

config.setValue("uart1.baudRate", 115200)
await Bun.write("board.syscfg", config.getString())
```

`getAssignment()` returns the **last top-level textual assignment** to an exact
static property path. It does not execute JavaScript, resolve aliases, evaluate
expressions, or calculate the effective device configuration. `setValue()` updates
that assignment, or appends one when absent. Keep this distinction in mind when
writing tests for handwritten scripts with branches or later SDK calls.

## Author a configuration

```ts
import { SysConfig, SysConfigReference } from "sysconfigts"

const config = new SysConfig()
config.addModule({
  name: "uart",
  modulePath: "/ti/drivers/UART",
  arguments: [{}, false],
})
config.addInstance({ name: "uart1", moduleName: "uart" })
config.setValue("uart1.$name", "CONFIG_UART_0")
config.setValue("uart1.baudRate", 115200)
config.setValue("uart1.someReference", new SysConfigReference({ path: "other1.$name" }))
console.log(config.getString())
```

The last assignment illustrates reference syntax; actual module paths, property
names, and allowed values depend on the TI device and SDK. Ordinary strings are
string literals. Use `SysConfigReference` for references, including bracket paths:
`new SysConfigReference({ path: ["uart1", "pins", 0, "$assign"] })`.

## Inspect and preview source

`inspectSysConfig(config)` returns source-ordered rows without collapsing repeated
assignments. `generateSysConfigSvg(config)` renders a deterministic SVG with fixed
assignments, suggestions, and unevaluated source clearly distinguished. Both accept
parsed or authored documents and leave them unchanged. This is a source preview,
**not a resolved pinout or TI validation**. See the
[inspection and preview guide](docs/inspection-and-preview.md).

The [CC2340 pedometer fixture](tests/fixtures/pedometer/README.md) is a documented
transcription of supplied development notes. Its TI validation is still pending.
From a checkout, export its SVG and round-tripped source with:

```sh
bun scripts/export-pedometer-preview.ts /tmp/sysconfig-previews
```

CI uploads these files as the `pedometer-source-preview` artifact. They are
library-generated review artifacts, not native TI visual output.

## Write configuration tests

```ts
import { expect, test } from "bun:test"
import { parseSysConfig, SysConfigLiteral } from "sysconfigts"

test("the source explicitly sets the expected UART baud rate", async () => {
  const config = parseSysConfig(await Bun.file("board.syscfg").text())
  const assignment = config.getAssignment("uart1.baudRate")
  expect(assignment?.value).toBeInstanceOf(SysConfigLiteral)
  if (!(assignment?.value instanceof SysConfigLiteral)) {
    throw new Error("Expected a literal baud rate")
  }
  expect(assignment.value.value).toBe(115200)
  expect(config.unknownNodes).toHaveLength(0)
})
```

This tests an explicit source setting. Even with no unknown nodes, calls and
references are not evaluated. The parser does **not** validate pin conflicts,
clock constraints, module availability, SDK defaults, or hardware compatibility.
Those checks need a separate validation layer and device/SDK metadata or TI's
SysConfig tooling. Never treat successful parsing as proof of a valid device
configuration.

## Model and supported syntax

- `SysConfig`: ordered `nodes`, filtered `modules`, `instances`, `assignments`,
  `unknownNodes`, and canonical `getString()` serialization.
- `SysConfigModule` / `SysConfigInstance`: single `var`, `let`, or `const`
  declarations using `scripting.addModule(...)`, `script.addModule(...)`, and
  `module.addInstance(...)`. Modules retain all additional call arguments.
- `SysConfigDeclaration`: other simple variable declarations.
- `SysConfigAssignment`: `=` assignments to static property paths, including
  nested `$assign`, `$suggestSolution`, `$name`, and indexed collections.
- `SysConfigCallStatement` / `SysConfigCall`: static API calls, including
  collection `.create(...)` calls. These represent syntax, never execution.
- `SysConfigLiteral`, `SysConfigReference`, `SysConfigArray`, `SysConfigObject`,
  and `SysConfigProperty`: typed values with mutable fields.
- `SysConfigTrivia`: comments, whitespace, metadata headers, and empty statements.
- `UnknownSysConfigStatement` / `UnknownSysConfigExpression`: preserved raw
  JavaScript for constructs outside the typed model (loops, branches, functions,
  destructuring, multi-variable declarations, arithmetic, spreads, array holes,
  dynamic computed properties, parenthesized expressions, etc.). Syntax errors throw `SysConfigParseError`
  with a one-based `line` and zero-based `column` when available.

All nodes extend `SysConfigNode`, expose a `type`, `getChildren()`, and
`toSource()`, and use object-shaped constructors. Walk `getChildren()` to build
inspectors or validation tooling. `sourceRange` records original UTF-16 offsets
on parsed syntax nodes; it is not recalculated after edits.

## Round trips and formatting

An unmodified parsed file serializes byte-for-byte, including comments, metadata,
line endings, quote styles, numeric spellings, and unknown syntax. Replacing a
value preserves surrounding source; deep edits preserve unchanged container
trivia when the child count and scalar fields stay the same. Changing a node's
structure (such as adding array elements) regenerates that node and can normalize
its formatting and remove comments **inside that regenerated node**. Surrounding
statements and document trivia remain intact.

New nodes use deterministic formatting. Object inputs supplied as plain records
have sorted keys; parsed objects and explicit property arrays retain their
original order because order and duplicate keys can matter in JavaScript.
Raw unknown nodes are an escape hatch: callers are responsible for the syntax
of manually supplied source and identifiers. Parse the output to check syntax
when constructing or structurally editing documents.

## Development

```sh
bun install
bun test
bun run typecheck
bun run format:check
```

Bun lockfiles are disabled per the handbook. GitHub Actions run tests, TypeScript
checking, and Biome checks on pushes and pull requests. Tests include an unmodified
TI-generated AM243x configuration; provenance and its BSD-3-Clause notice are in
[`tests/fixtures`](tests/fixtures).

Future work: broaden typed syntax coverage, add fixtures from other TI SDK
families, then build a separate rule layer for configuration assertions and
SDK-aware validation.

## License

MIT for this library. TI fixtures retain their upstream BSD-3-Clause license.
