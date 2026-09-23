import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  parseSysConfig,
  SysConfig,
  type SysConfigArray,
  SysConfigAssignment,
  SysConfigCall,
  SysConfigInstance,
  SysConfigLiteral,
  SysConfigModule,
  type SysConfigObject,
  SysConfigParseError,
  SysConfigReference,
  toExpression,
  UnknownSysConfigExpression,
  UnknownSysConfigStatement,
} from "../lib"

const fixture = readFileSync(
  new URL("./fixtures/am243x-benchmark.syscfg", import.meta.url),
  "utf8",
)

describe("upstream TI fixture", () => {
  test("round-trips byte-for-byte, including CLI metadata and pin assignments", () => {
    const doc = parseSysConfig(fixture)
    expect(doc.getString()).toBe(fixture)
    expect(doc.modules.length).toBeGreaterThan(5)
    expect(doc.instances.length).toBeGreaterThan(10)
    expect(doc.modules.find((m) => m.name === "uart")?.modulePath).toBe(
      "/drivers/uart/uart",
    )
    expect(doc.instances.find((i) => i.name === "uart1")?.moduleName).toBe(
      "uart",
    )
    expect(doc.getAssignment("uart1.UART.$assign")?.value).toBeInstanceOf(
      SysConfigLiteral,
    )
    expect(doc.unknownNodes).toHaveLength(0)
  })
  test("edits a value without changing any surrounding source", () => {
    const doc = parseSysConfig(fixture)
    doc.setValue("uart1.UART.$assign", "USART1")
    const result = doc.getString()
    expect(result).toBe(fixture.replace('"USART0"', '"USART1"'))
    expect(parseSysConfig(result).getString()).toBe(result)
  })
})

describe("source preservation", () => {
  for (const source of [
    "",
    "// header only\r\n",
    "\ufeff// BOM\r\nvar a = script.addModule('/ti/drivers/GPIO');\r\na.x = 0xFF; // tail",
    'const a = scripting.addModule("x", {}, false);\na.x = [1, 2,];',
    'a["pin-name"] = {x: true, y: null};\na.p = other.$solution;',
    "let a = /a;b/;\nif (a) { foo(); }\n// eof",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: JavaScript parser fixture
    "const x = `hello ${world}`;\na.x = [,,1];",
    "var a = 1, b = 2;\na.x += 1;",
    "a.x = (1 + 2);\na.y = -0;",
  ]) {
    test(`round-trips ${JSON.stringify(source.slice(0, 35))}`, () =>
      expect(parseSysConfig(source).getString()).toBe(source))
  }
  test("preserves inline comments when replacing a value", () => {
    const doc = parseSysConfig(
      "a.x /* key */ = /* value */ 0x10; // trailing\r\n",
    )
    doc.setValue("a.x", 32)
    expect(doc.getString()).toBe(
      "a.x /* key */ = /* value */ 32; // trailing\r\n",
    )
  })
  test("deep edits preserve object and array trivia", () => {
    const doc = parseSysConfig("a.x = { foo: [ 1, /* hi */ 2 ] };")
    const object = doc.assignments[0]!.value as SysConfigObject
    const array = object.properties[0]!.value as SysConfigArray
    ;(array.items[1] as SysConfigLiteral).value = 3
    expect(doc.getString()).toBe("a.x = { foo: [ 1, /* hi */ 3 ] };")
    array.items.push(new SysConfigLiteral({ value: 4 }))
    expect(parseSysConfig(doc.getString()).getString()).toBe(doc.getString())
  })
  test("unknown constructs remain available and are never executed", () => {
    const source =
      'throw new Error("must not run");\na.x = (() => { throw 1 })();\nfor (;;) { break; }'
    const doc = parseSysConfig(source)
    expect(doc.unknownNodes).toHaveLength(3)
    expect(doc.unknownNodes[0]).toBeInstanceOf(UnknownSysConfigStatement)
    expect(doc.unknownNodes[1]).toBeInstanceOf(UnknownSysConfigExpression)
    expect(doc.getString()).toBe(source)
  })
  test("metadata and unknown statements survive unrelated edits", () => {
    const source =
      '/** @cliArgs --device "AM243x" */\nscripting.doFutureThing();\na.x=1;'
    const doc = parseSysConfig(source)
    doc.setValue("a.x", 2)
    expect(doc.getString()).toBe(source.replace("a.x=1", "a.x=2"))
  })
})

describe("typed authoring and inspection", () => {
  test("authors, parses and edits modules, instances and reference assignments", () => {
    const doc = new SysConfig()
    doc.addModule({
      name: "uart",
      modulePath: "/ti/drivers/UART",
      arguments: [{}, false],
    })
    doc.addInstance({
      name: "uart1",
      moduleName: "uart",
      arguments: [{ $name: "CONFIG_UART" }],
    })
    doc.setValue("uart1.baudRate", 115200)
    doc.setValue("uart1.txPin", new SysConfigReference({ path: "gpio1.$name" }))
    const result = parseSysConfig(doc.getString())
    expect(result.modules[0]).toBeInstanceOf(SysConfigModule)
    expect(result.instances[0]).toBeInstanceOf(SysConfigInstance)
    expect(
      (result.getAssignment("uart1.baudRate")!.value as SysConfigLiteral).value,
    ).toBe(115200)
    expect(result.getAssignment("uart1.txPin")?.value).toBeInstanceOf(
      SysConfigReference,
    )
    expect(result.getString()).toBe(doc.getString())
  })
  test("last textual assignment wins for lookup and mutation", () => {
    const doc = parseSysConfig('a.x=1;\na["x"]=2;')
    doc.setValue("a.x", 3)
    expect(doc.getString()).toBe('a.x=1;\na["x"]=3;')
  })
  test("new assignments can be appended after a trailing line comment", () => {
    const doc = parseSysConfig("a.x=1 // trailing")
    doc.setValue("a.y", true)
    expect(parseSysConfig(doc.getString()).assignments).toHaveLength(2)
  })
  test("object inputs use deterministic sorted keys", () => {
    expect(toExpression({ z: 1, a: [true, null] }).toSource()).toBe(
      toExpression({ a: [true, null], z: 1 }).toSource(),
    )
  })
  test("static bracket references do not collide with dotted references", () => {
    const doc = parseSysConfig(
      'a["x.y"] = 1; a.x.y = 2; a.items[0].$assign = "PIN0";',
    )
    expect(
      (
        doc.getAssignment(new SysConfigReference({ path: ["a", "x.y"] }))!
          .value as SysConfigLiteral
      ).value,
    ).toBe(1)
    expect((doc.getAssignment("a.x.y")!.value as SysConfigLiteral).value).toBe(
      2,
    )
    expect(doc.assignments[2]!.target.path).toEqual([
      "a",
      "items",
      0,
      "$assign",
    ])
  })
  test("children support generic tree walking", () => {
    const doc = parseSysConfig('const a = scripting.addModule("x", {}, false);')
    expect(doc.getChildren()[0]!.getChildren()[0]).toBeInstanceOf(SysConfigCall)
  })
  test("programmatic output uses explicit statement separators", () => {
    const doc = new SysConfig({
      nodes: [
        new SysConfigAssignment({ target: "a.x", value: -0 }),
        new SysConfigAssignment({ target: "a.y", value: "hello\nworld" }),
      ],
    })
    expect(doc.getString()).toBe('a.x = -0;\na.y = "hello\\nworld";')
  })
  test("rejects non-finite authored numbers", () => {
    expect(() => new SysConfigLiteral({ value: NaN }).toSource()).toThrow(
      "finite",
    )
  })
})

test("invalid syntax reports a location", () => {
  try {
    parseSysConfig("// header\na.x = ;")
    throw new Error("expected failure")
  } catch (error) {
    expect(error).toBeInstanceOf(SysConfigParseError)
    expect((error as SysConfigParseError).line).toBe(2)
    expect((error as SysConfigParseError).column).toBe(6)
  }
})

test("structural edits retain parentheses that protect expression semantics", () => {
  const doc = parseSysConfig("a.x = [(1, 2)];")
  const array = doc.assignments[0]!.value as SysConfigArray
  array.items.push(new SysConfigLiteral({ value: 3 }))
  expect(doc.getString()).toBe("a.x = [(1, 2), 3];")
  const reparsed = parseSysConfig(doc.getString()).assignments[0]!
    .value as SysConfigArray
  expect(reparsed.items).toHaveLength(2)
})

test("edits to module arguments and names serialize through the class model", () => {
  const doc = parseSysConfig(
    'var gpio = script.addModule("old", /* options */ {}, false);',
  )
  const module = doc.modules[0]!
  const call = module.value as SysConfigCall
  ;(call.arguments[0] as SysConfigLiteral).value = "/ti/drivers/GPIO"
  expect(doc.getString()).toBe(
    'var gpio = script.addModule("/ti/drivers/GPIO", /* options */ {}, false);',
  )
  module.name = "gpioModule"
  expect(parseSysConfig(doc.getString()).modules[0]!.name).toBe("gpioModule")
})
