import { expect, test } from "bun:test"
import { gzipSync } from "node:zlib"
import {
  createSysConfigViewerUrl,
  decodeSysConfigHash,
  encodeSysConfigHash,
  MAX_SYSCONFIG_SOURCE_BYTES,
  SYSCONFIG_HASH_PREFIX,
  type SysConfigSourcePayload,
} from "../lib/url"

const payload: SysConfigSourcePayload = {
  schema_version: 2,
  filename: "board-雪.syscfg",
  source: "\uFEFF// 雪 ⚡ </script>\r\nconst text = 'München';\n",
}
function fragment(bytes: Uint8Array | string) {
  return SYSCONFIG_HASH_PREFIX + gzipSync(bytes).toString("base64")
}

test("URL fragment round trips exact Unicode source/line endings and is absent from request pathname/search", async () => {
  const url = new URL(
    await createSysConfigViewerUrl(
      payload,
      "https://sysconfig-viewer.tscircuit.com/",
    ),
  )
  expect(await decodeSysConfigHash(url.hash)).toEqual(payload)
  expect(url.pathname + url.search).toBe("/")
  expect(url.hash).toStartWith(SYSCONFIG_HASH_PREFIX)
  expect(url.href).not.toContain("</script>")
  expect(
    await decodeSysConfigHash(
      await encodeSysConfigHash({ ...payload, source: "" }),
    ),
  ).toEqual({ ...payload, source: "" })
})

test("rejects malformed payloads instead of treating arbitrary fragments as scripts", async () => {
  for (const hash of [
    "#alert(1)",
    SYSCONFIG_HASH_PREFIX,
    `${SYSCONFIG_HASH_PREFIX}%%%%`,
    SYSCONFIG_HASH_PREFIX + btoa("not gzip"),
    fragment("not JSON"),
    fragment(new Uint8Array([0xff, 0xfe])),
  ])
    await expect(decodeSysConfigHash(hash)).rejects.toThrow()
  for (const patch of [
    { schema_version: 1 },
    { filename: "../secret.syscfg" },
    { filename: ".syscfg" },
    { filename: "bad\u0001.syscfg" },
    { filename: "bad\u007f.syscfg" },
    { filename: "\ud800.syscfg" },
    { source: "\udfff" },
    { toolVersion: "1.28.1+4785" },
    { unknown: true },
    { source: null },
  ])
    await expect(
      decodeSysConfigHash(fragment(JSON.stringify({ ...payload, ...patch }))),
    ).rejects.toThrow()
})

test("limits compressed input, inflated JSON, and UTF-8 source bytes", async () => {
  await expect(
    decodeSysConfigHash(SYSCONFIG_HASH_PREFIX + "A".repeat(6 * 1024 * 1024)),
  ).rejects.toThrow("oversized")
  await expect(
    decodeSysConfigHash(
      fragment(" ".repeat(MAX_SYSCONFIG_SOURCE_BYTES * 6 + 16 * 1024 + 1)),
    ),
  ).rejects.toThrow("oversized")
  const source = "雪".repeat(Math.floor(MAX_SYSCONFIG_SOURCE_BYTES / 3) + 1)
  await expect(encodeSysConfigHash({ ...payload, source })).rejects.toThrow(
    "4 MiB",
  )
  await expect(
    decodeSysConfigHash(fragment(JSON.stringify({ ...payload, source }))),
  ).rejects.toThrow("4 MiB")
})

test("viewer URL permits HTTP(S) only, without credential-bearing destinations", async () => {
  for (const base of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@example.com/",
  ])
    await expect(createSysConfigViewerUrl(payload, base)).rejects.toThrow()
})
