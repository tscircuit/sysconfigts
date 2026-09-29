import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { inspectSysConfig, parseSysConfig } from "../lib"

test("inspection preserves statement order, repeats, references, calls and unknown source", () => {
  const source = [
    'const gpio = scripting.addModule("/drivers/gpio/gpio", {}, false);',
    "const gpio1 = gpio.addInstance();",
    'gpio1.pin.$assign = "A7";',
    'gpio1.pin.$assign = "B7";',
    "gpio1.pin.$suggestSolution = other.pin;",
    "gpio1.option = 1 + 2;",
    "scripting.futureCall();",
    'if (false) { gpio1.pin.$assign = "C7"; }',
  ].join("\n")
  const config = parseSysConfig(source)
  const rows = inspectSysConfig(config)
  expect(rows.map((row) => row.kind)).toEqual([
    "module",
    "instance",
    "fixed_assignment",
    "fixed_assignment",
    "suggested_assignment",
    "assignment",
    "call",
    "unknown_statement",
  ])
  expect(rows[2]?.expression).toBe('"A7"')
  expect(rows[3]?.expression).toBe('"B7"')
  expect(rows[4]?.expression).toBe("other.pin")
  expect(rows[5]?.expression).toBe("1 + 2")
  expect(rows[7]?.expression).toContain("if (false)")
  expect(inspectSysConfig(config)).toEqual(rows)
  expect(inspectSysConfig(parseSysConfig(config.getString()))).toEqual(rows)
  expect(config.getString()).toBe(source)
})

test("distinguishes static bracket paths without evaluating aliases", () => {
  const rows = inspectSysConfig(parseSysConfig('a["x.y"] = 1; a.x.y = 2;'))
  expect(rows.map((row) => row.target)).toEqual(['a["x.y"]', "a.x.y"])
})

test("Unicode targets parse, inspect and serialize without losing source", () => {
  for (const target of [
    "π.gpioPin.$assign",
    String.raw`\u03c0.gpioPin.$assign`,
    "π [ 'gpioPin' ] .$assign",
  ]) {
    const source = `${target} = "DIO8";\n`
    const config = parseSysConfig(source)
    expect(config.assignments).toHaveLength(1)
    expect(config.getString()).toBe(source)
    expect(inspectSysConfig(config)).toEqual([
      { kind: "fixed_assignment", target, expression: '"DIO8"' },
    ])
    expect(config.getString()).toBe(source)
  }
})

test("metadata headers are ordered textual rows while ordinary comments stay omitted", () => {
  const source = [
    "/**",
    " * Ordinary comment mentioning @cliArgs is not a header.",
    ' * @cliArgs --device "CC2340R5RGE"',
    ' * @v2CliArgs --device "CC2340R5"',
    " * @versions unparsed recorded text",
    ' * @cliArgsExtra --device "ignored"',
    " */",
    "a.x = 1;",
    '// @cliArgs --device "another target"',
    '/* @versions {"tool":"1.26.3+4558"} */',
    'a.text = "@versions is only a string";',
  ].join("\r\n")
  const config = parseSysConfig(source)
  const rows = inspectSysConfig(config)
  expect(rows.map((row) => row.kind)).toEqual([
    "metadata",
    "metadata",
    "metadata",
    "assignment",
    "metadata",
    "metadata",
    "assignment",
  ])
  expect(rows.filter((row) => row.kind === "metadata")).toEqual([
    {
      kind: "metadata",
      target: "@cliArgs",
      expression: '--device "CC2340R5RGE"',
    },
    {
      kind: "metadata",
      target: "@v2CliArgs",
      expression: '--device "CC2340R5"',
    },
    {
      kind: "metadata",
      target: "@versions",
      expression: "unparsed recorded text",
    },
    {
      kind: "metadata",
      target: "@cliArgs",
      expression: '--device "another target"',
    },
    {
      kind: "metadata",
      target: "@versions",
      expression: '{"tool":"1.26.3+4558"}',
    },
  ])
  expect(config.getString()).toBe(source)
})

test("metadata changes affect inspection and header-only input preserves recorded text", () => {
  const source = '// @cliArgs --device "first"\na.x = 1;'
  expect(inspectSysConfig(parseSysConfig(source))).not.toEqual(
    inspectSysConfig(parseSysConfig(source.replace("first", "second"))),
  )
  const header = '/* @versions {"tool":"<script>&"} */'
  const config = parseSysConfig(header)
  expect(inspectSysConfig(config)).toEqual([
    {
      kind: "metadata",
      target: "@versions",
      expression: '{"tool":"<script>&"}',
    },
  ])
  expect(config.getString()).toBe(header)
})

test("native TI fixture inspection leaves its round trip untouched", () => {
  const source = readFileSync(
    new URL("./fixtures/am243x-benchmark.syscfg", import.meta.url),
    "utf8",
  )
  const config = parseSysConfig(source)
  expect(inspectSysConfig(config).length).toBeGreaterThan(10)
  expect(config.getString()).toBe(source)
})

test("inspection preserves markup and never evaluates hostile source", () => {
  const config = parseSysConfig(
    'a.x = "</text><script>alert(1)</script>&"; throw new Error("must not run");',
  )
  expect(inspectSysConfig(config)).toEqual([
    {
      kind: "assignment",
      target: "a.x",
      expression: '"</text><script>alert(1)</script>&"',
    },
    {
      kind: "unknown_statement",
      target: "",
      expression: 'throw new Error("must not run");',
    },
  ])
})

test("inspection retains long paths and omits empty input and ordinary comments", () => {
  const path = `a.${"p".repeat(300)}`
  expect(inspectSysConfig(parseSysConfig(`${path} = 123;`))).toEqual([
    { kind: "assignment", target: path, expression: "123" },
  ])
  expect(inspectSysConfig(parseSysConfig(""))).toEqual([])
  expect(inspectSysConfig(parseSysConfig("// comment only"))).toEqual([])
})

test("inspection matches the inline text snapshot", () => {
  const source = readFileSync(
    new URL("./fixtures/inspection.syscfg", import.meta.url),
    "utf8",
  )
  expect(inspectSysConfig(parseSysConfig(source))).toMatchInlineSnapshot(`
    [
      {
        "expression": "--device "CC2340R5RGE" --product "simplelink_lowpower_f3_sdk@9.21.00.36"",
        "kind": "metadata",
        "target": "@cliArgs",
      },
      {
        "expression": "--device "CC2340R5" --package "VQFN (RGE)"",
        "kind": "metadata",
        "target": "@v2CliArgs",
      },
      {
        "expression": "{"tool":"1.26.3+4558"}",
        "kind": "metadata",
        "target": "@versions",
      },
      {
        "expression": "scripting.addModule("/drivers/gpio/gpio", {}, false)",
        "kind": "module",
        "target": "gpio",
      },
      {
        "expression": "gpio.addInstance()",
        "kind": "instance",
        "target": "gpio1",
      },
      {
        "expression": ""A7"",
        "kind": "fixed_assignment",
        "target": "gpio1.pin.$assign",
      },
      {
        "expression": ""B7"",
        "kind": "suggested_assignment",
        "target": "gpio1.pin.$suggestSolution",
      },
    ]
  `)
})
