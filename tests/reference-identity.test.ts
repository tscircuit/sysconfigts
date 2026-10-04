import { expect, test } from "bun:test"
import { parseSysConfig, SysConfigReference } from "../lib"

for (const [numericSource, stringSource, key] of [
  ["0", '"0"', 0],
  ["0x10", '"16"', 16],
  ["1.5", '"1.5"', 1.5],
  ["1e3", '"1000"', 1000],
] as const) {
  for (const reverse of [false, true]) {
    test(`updates the last assignment for equivalent ${numericSource}/${stringSource} keys, reverse=${reverse}`, () => {
      const keys = reverse
        ? [stringSource, numericSource]
        : [numericSource, stringSource]
      const source =
        `uart.channels[${keys[0]}].$assign = "first"; // keep first\r\n` +
        `uart.channels[${keys[1]}].$assign = "last"; // keep last\r\n`
      const config = parseSysConfig(source)
      const numericTarget = new SysConfigReference({
        path: ["uart", "channels", key, "$assign"],
      })
      const stringTarget = new SysConfigReference({
        path: ["uart", "channels", String(key), "$assign"],
      })
      const paths = config.assignments.map((assignment) => [
        ...assignment.target.path,
      ])

      expect(config.getString()).toBe(source)
      expect(config.getAssignment(numericTarget)).toBe(config.assignments[1])
      expect(config.getAssignment(stringTarget)).toBe(config.assignments[1])
      config.setValue(numericTarget, "updated")
      expect(config.assignments).toHaveLength(2)
      expect(config.getString()).toBe(source.replace('"last"', '"updated"'))
      expect(
        config.assignments.map((assignment) => assignment.target.path),
      ).toEqual(paths)
      expect(
        parseSysConfig(config.getString())
          .getAssignment(stringTarget)
          ?.value.toSource(),
      ).toBe('"updated"')
    })
  }
}

test("setValue does not append an existing quoted collection index", () => {
  const config = parseSysConfig('uart.channels["0"].$assign = "PIN0";')
  config.setValue(
    new SysConfigReference({ path: ["uart", "channels", 0, "$assign"] }),
    "PIN1",
  )
  expect(config.assignments).toHaveLength(1)
  expect(config.getString()).toBe('uart.channels["0"].$assign = "PIN1";')
})

test("property-key equivalence does not coerce distinct strings or path segments", () => {
  const numeric = new SysConfigReference({ path: ["uart", "channels", 0] })
  expect(
    numeric.equals(new SysConfigReference({ path: ["uart", "channels", "0"] })),
  ).toBe(true)
  expect(
    numeric.equals(new SysConfigReference({ path: ["uart", "channels", -0] })),
  ).toBe(true)
  for (const path of [
    ["uart", "channels", "00"],
    ["uart", "channels", "0.0"],
    ["uart", "channels", "-0"],
    ["other", "channels", 0],
    ["uart", "channels.0"],
    ["uart", "channels", 0, "$assign"],
  ]) {
    const different = new SysConfigReference({ path })
    expect(numeric.equals(different)).toBe(false)
    expect(different.equals(numeric)).toBe(false)
  }
})
