import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  generateSysConfigSvg,
  inspectSysConfig,
  parseSysConfig,
  SysConfig,
  UnknownSysConfigStatement,
} from "../lib"

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
  const svg = generateSysConfigSvg(config)
  expect(svg).toContain("FIXED ($assign)")
  expect(svg).toContain("SUGGESTION")
  expect(svg).toContain("Not a resolved pinout")
  expect(generateSysConfigSvg(config)).toBe(svg)
  expect(config.getString()).toBe(source)
})

test("distinguishes static bracket paths without evaluating aliases", () => {
  const rows = inspectSysConfig(parseSysConfig('a["x.y"] = 1; a.x.y = 2;'))
  expect(rows.map((row) => row.target)).toEqual(['a["x.y"]', "a.x.y"])
})

test("Unicode targets parse, inspect, preview and serialize without losing source", () => {
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
    const svg = generateSysConfigSvg(config)
    expect(svg).toContain(target.replaceAll("'", "&apos;"))
    expect(svg).toContain("DIO8")
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

test("metadata changes affect the preview and header-only SVG escapes recorded text", () => {
  const source = '// @cliArgs --device "first"\na.x = 1;'
  expect(generateSysConfigSvg(parseSysConfig(source))).not.toBe(
    generateSysConfigSvg(parseSysConfig(source.replace("first", "second"))),
  )
  const header = '/* @versions {"tool":"<script>&"} */'
  const config = parseSysConfig(header)
  const svg = generateSysConfigSvg(config)
  expect(svg).toContain("METADATA (RECORDED)")
  expect(svg).toContain(
    "@versions {&quot;tool&quot;:&quot;&lt;script&gt;&amp;&quot;}",
  )
  expect(svg).not.toContain("<script>")
  expect(svg).not.toContain("No statements")
  expect(config.getString()).toBe(header)
})

test("native TI fixture preview leaves its round trip untouched", () => {
  const source = readFileSync(
    new URL("./fixtures/am243x-benchmark.syscfg", import.meta.url),
    "utf8",
  )
  const config = parseSysConfig(source)
  expect(inspectSysConfig(config).length).toBeGreaterThan(10)
  expect(generateSysConfigSvg(config)).toContain("SysConfig source preview")
  expect(config.getString()).toBe(source)
})

test("SVG escapes markup and never evaluates hostile source", () => {
  const config = parseSysConfig(
    'a.x = "</text><script>alert(1)</script>&"; throw new Error("must not run");',
  )
  const svg = generateSysConfigSvg(config)
  expect(svg).not.toContain("<script>")
  expect(svg).toContain("&lt;script&gt;")
  expect(svg).toContain("UNKNOWN STATEMENT")
  expect(svg).toContain("must not run")
})

test("long paths wrap without truncation and empty input remains readable", () => {
  const path = `a.${"p".repeat(300)}`
  const svg = generateSysConfigSvg(parseSysConfig(`${path} = 123;`))
  expect(svg).toContain(`<title>${path} = 123</title>`)
  expect(svg.match(/xml:space="preserve"/g)?.length).toBeGreaterThan(3)
  expect(generateSysConfigSvg(parseSysConfig("// comment only"))).toContain(
    "No statements",
  )
})

test("SVG matches the reviewed deterministic snapshot", () => {
  const source = readFileSync(
    new URL("./fixtures/preview.syscfg", import.meta.url),
    "utf8",
  )
  const expected = readFileSync(
    new URL("./fixtures/preview.svg", import.meta.url),
    "utf8",
  )
  expect(generateSysConfigSvg(parseSysConfig(source))).toBe(expected)
})

test("SVG replaces invalid XML characters without changing authored source", () => {
  const invalidCodePoints = [0, 8, 11, 12, 0xfffe, 0xffff, 0xd800]
  const source = `${String.fromCodePoint(...invalidCodePoints)} <>&"'🙂`
  const config = new SysConfig({
    nodes: [new UnknownSysConfigStatement({ source })],
  })
  const svg = generateSysConfigSvg(config)
  const svgCodePoints = Array.from(svg, (character) => character.codePointAt(0))
  for (const codePoint of invalidCodePoints) {
    expect(svgCodePoints).not.toContain(codePoint)
  }
  expect(svg.isWellFormed()).toBe(true)
  expect(svg).toContain("\ufffd")
  expect(svg).toContain("&lt;&gt;&amp;&quot;&apos;🙂")
  expect(config.getString()).toBe(source)
})
