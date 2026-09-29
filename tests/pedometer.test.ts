import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  generateSysConfigSvg,
  inspectSysConfig,
  parseSysConfig,
  SysConfigLiteral,
} from "../lib"

const source = readFileSync(
  new URL("./fixtures/pedometer/pedometer.syscfg", import.meta.url),
  "utf8",
)

test("pedometer transcription round-trips with both CLI headers", () => {
  const config = parseSysConfig(source)
  expect(config.getString()).toBe(source)
  expect(config.unknownNodes).toHaveLength(0)
  expect(config.getString()).toContain('@cliArgs --device "CC2340R5RGE"')
  expect(config.getString()).toContain('@v2CliArgs --device "CC2340R5"')
  expect(config.getString()).toContain('"tool":"1.26.3+4558"')
  expect(config.modules.map((module) => module.modulePath)).toEqual([
    "/freertos/FreeRTOS",
    "/ti/ble/ble",
    "/ti/devices/CCFG",
    "/ti/devices/radioconfig/rfdesign",
    "/ti/drivers/GPIO",
    "/ti/drivers/I2C",
    "/ti/drivers/NVS",
    "/ti/drivers/Power",
    "/ti/drivers/RCL",
    "/ti/drivers/RNG",
    "/ti/posix/freertos/Settings",
    "/ti/drivers/cryptoutils/aes/AESCommonXXF3",
  ])
  expect(config.instances.map((instance) => instance.name)).toEqual([
    "GPIO3",
    "GPIO4",
    "GPIO5",
    "GPIO6",
    "GPIO7",
    "GPIO8",
    "I2C1",
    "NVS1",
  ])
})

test("pedometer keeps exact pins, nested settings, and omitted defaults", () => {
  const config = parseSysConfig(source)
  for (const [target, expected] of [
    ["GPIO3.gpioPin.$assign", "DIO20_A11"],
    ["GPIO4.gpioPin.$assign", "DIO11"],
    ["GPIO5.gpioPin.$assign", "DIO12"],
    ["GPIO6.gpioPin.$assign", "DIO13"],
    ["GPIO7.gpioPin.$assign", "DIO21_A10"],
    ["GPIO8.gpioPin.$assign", "DIO24_A7"],
    ["GPIO8.interruptTrigger", "Falling Edge"],
    ["I2C1.i2c.sdaPin.$assign", "DIO8"],
    ["I2C1.i2c.sclPin.$assign", "DIO6_A1_AR+"],
    ["I2C1.i2c.$suggestSolution", "I2C0"],
    ["ble.deviceName", "Stride"],
    ["ble.advSet1.advData1.UUID016More", 0xfff0],
    ["FreeRTOS.heapSize", 0x4d50],
    ["NVS1.internalFlash.regionBase", 0x7d000],
    ["NVS1.internalFlash.regionSize", 0x3000],
    ["AESCommonXXF3.laes.dataLaesChannelA.$assign", "DMA_CH4"],
    ["AESCommonXXF3.laes.dataLaesChannelB.$assign", "DMA_CH5"],
  ] as const) {
    const expression = config.getAssignment(target)?.value
    expect(expression).toBeInstanceOf(SysConfigLiteral)
    if (!(expression instanceof SysConfigLiteral)) {
      throw new Error(`Expected a literal at ${target}`)
    }
    expect(expression.value).toBe(expected)
  }
  expect(config.getAssignment("GPIO5.mode")).toBeUndefined()
  expect(config.getAssignment("GPIO5.interruptTrigger")).toBeUndefined()
  expect(config.getAssignment("GPIO4.initialOutputState")).toBeUndefined()
})

test("one GPIO-name edit preserves unrelated source byte-for-byte", () => {
  const config = parseSysConfig(source)
  config.setValue("GPIO8.$name", "CONFIG_USER_BUTTON")
  const edited = config.getString()
  expect(edited).toBe(source.replace('"CONFIG_BUTTON"', '"CONFIG_USER_BUTTON"'))
  expect(parseSysConfig(edited).getString()).toBe(edited)
})

test("pin edits are textual edits, without silently changing BLE or RTOS", () => {
  const config = parseSysConfig(source)
  config.setValue("GPIO4.gpioPin.$assign", "DIO10")
  const edited = config.getString()
  expect(edited).toBe(source.replace('"DIO11"', '"DIO10"'))
  expect(parseSysConfig(edited).getString()).toBe(edited)
  // This tests syntax preservation, not whether DIO10 is suitable for the board.
})

test("pedometer inspection snapshots recorded headers, fixed pins and suggestions", () => {
  const config = parseSysConfig(source)
  const rows = inspectSysConfig(config)
  expect(
    rows.filter(
      (row) =>
        row.kind === "metadata" ||
        row.kind === "fixed_assignment" ||
        row.kind === "suggested_assignment",
    ),
  ).toMatchInlineSnapshot(`
    [
      {
        "expression": "--device "CC2340R5RGE" --part "Default" --package "RGE" --rtos "freertos" --product "simplelink_lowpower_f3_sdk@9.21.00.36"",
        "kind": "metadata",
        "target": "@cliArgs",
      },
      {
        "expression": "--device "CC2340R5" --package "VQFN (RGE)" --rtos "freertos" --product "simplelink_lowpower_f3_sdk@9.21.00.36"",
        "kind": "metadata",
        "target": "@v2CliArgs",
      },
      {
        "expression": "{"tool":"1.26.3+4558"}",
        "kind": "metadata",
        "target": "@versions",
      },
      {
        "expression": ""DIO20_A11"",
        "kind": "fixed_assignment",
        "target": "GPIO3.gpioPin.$assign",
      },
      {
        "expression": ""DIO11"",
        "kind": "fixed_assignment",
        "target": "GPIO4.gpioPin.$assign",
      },
      {
        "expression": ""DIO12"",
        "kind": "fixed_assignment",
        "target": "GPIO5.gpioPin.$assign",
      },
      {
        "expression": ""DIO13"",
        "kind": "fixed_assignment",
        "target": "GPIO6.gpioPin.$assign",
      },
      {
        "expression": ""DIO21_A10"",
        "kind": "fixed_assignment",
        "target": "GPIO7.gpioPin.$assign",
      },
      {
        "expression": ""DIO24_A7"",
        "kind": "fixed_assignment",
        "target": "GPIO8.gpioPin.$assign",
      },
      {
        "expression": ""DIO8"",
        "kind": "fixed_assignment",
        "target": "I2C1.i2c.sdaPin.$assign",
      },
      {
        "expression": ""DIO6_A1_AR+"",
        "kind": "fixed_assignment",
        "target": "I2C1.i2c.sclPin.$assign",
      },
      {
        "expression": ""LAES"",
        "kind": "fixed_assignment",
        "target": "AESCommonXXF3.laes.$assign",
      },
      {
        "expression": ""DMA_CH4"",
        "kind": "fixed_assignment",
        "target": "AESCommonXXF3.laes.dataLaesChannelA.$assign",
      },
      {
        "expression": ""DMA_CH5"",
        "kind": "fixed_assignment",
        "target": "AESCommonXXF3.laes.dataLaesChannelB.$assign",
      },
      {
        "expression": ""I2C0"",
        "kind": "suggested_assignment",
        "target": "I2C1.i2c.$suggestSolution",
      },
    ]
  `)
  expect(config.getString()).toBe(source)
})

test("pedometer preview distinguishes suggestions and does not mutate source", () => {
  const config = parseSysConfig(source)
  const svg = generateSysConfigSvg(config)
  expect(svg).toContain("CC2340R5RGE")
  expect(svg).toContain("simplelink_lowpower_f3_sdk@9.21.00.36")
  expect(svg).toContain("1.26.3+4558")
  expect(svg.indexOf("METADATA (RECORDED)")).toBeLessThan(svg.indexOf("MODULE"))
  expect(svg).toContain("DIO6_A1_AR+")
  expect(svg).toContain("CONFIG_DISPLAY_ISOLATE")
  expect(svg).toContain("FreeRTOS.heapSize")
  expect(svg).toContain("SUGGESTION")
  expect(svg).toContain("Not a resolved pinout")
  expect(generateSysConfigSvg(config)).toBe(svg)
  expect(generateSysConfigSvg(parseSysConfig(config.getString()))).toBe(svg)
  expect(config.getString()).toBe(source)
})
