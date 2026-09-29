# Inspect a SysConfig document

```ts
import { inspectSysConfig, parseSysConfig } from "sysconfigts"

const config = parseSysConfig(await Bun.file("pedometer.syscfg").text())
console.log(inspectSysConfig(config))
```

`inspectSysConfig()` accepts an existing `SysConfig`, including a document
constructed in TypeScript. It has no filesystem, Circuit JSON, browser, or TI
dependency. Its output is deterministic for a given document. Tests compare
inspection rows with `toMatchInlineSnapshot()` so the
expected metadata, targets, and expressions are readable directly in the test.
See the [compact inspection example](../tests/inspection.test.ts) and
[pedometer header and pin snapshot](../tests/pedometer.test.ts).

`inspectSysConfig()` returns ordered `{ kind, target, expression }` rows. Recorded
`@cliArgs`, `@v2CliArgs`, and `@versions` comment lines appear as `metadata` rows,
with the header name as `target` and its remaining text as `expression`. They stay
in source order (normally at the top), so device, package, SDK, and tool strings
are included in inspection results. Header contents are shown as text, without
parsing CLI arguments or version JSON. Other trivia is omitted; repeated headers and
assignments are retained. `$assign` is labeled
`fixed_assignment`; `$suggestSolution` is `suggested_assignment`. Modules,
instances, declarations, calls, and unknown statements remain distinguishable.
Assignment targets and expressions use their existing nodes' `toSource()` output,
preserving parsed spelling, Unicode identifiers, and bracket notation without
resolving aliases. New or structurally edited nodes use the serializer's normal
formatting. Inspection does not edit the document or compute effective values.

**Inspection reports textual facts without resolving pins or validating TI settings.**
Assignments inside unsupported control flow remain visible as unknown source,
not extracted as unconditional settings. Calls, expressions, and SDK defaults
are not evaluated. Even a literal `$assign` is only a textual request until TI
resolves the configuration. Use TI's matching SDK/tool and generated outputs
for independent hardware validation; matching inspection rows does not establish
it.

The [pedometer fixture notes](../tests/fixtures/pedometer/README.md) describe the
supplied CC2340 configuration, transcription provenance, and pending TI checks.
There is no checked-in TI-generated result for it yet.
