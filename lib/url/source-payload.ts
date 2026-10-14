import { Gunzip, gzipSync } from "fflate"
import { z } from "zod"
import { MAX_SYSCONFIG_SOURCE_BYTES } from "./limits"

export { MAX_SYSCONFIG_SOURCE_BYTES } from "./limits"

export const SYSCONFIG_HASH_PREFIX = "#data:application/gzip;base64,"
const MAX_JSON_BYTES = MAX_SYSCONFIG_SOURCE_BYTES * 6 + 16 * 1024
const MAX_COMPRESSED_BYTES = MAX_SYSCONFIG_SOURCE_BYTES + 64 * 1024
const encoder = new TextEncoder()
const wellFormed = (text: string) =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    text,
  )

export const sysConfigSourcePayloadSchema = z
  .object({
    schema_version: z.literal(2),
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^./\\:][^/\\:]*\.syscfg$/i)
      .refine(wellFormed, "Filename must be well-formed Unicode")
      .refine(
        (filename) =>
          [...filename].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        "Filename must not contain control characters",
      ),
    source: z
      .string()
      .refine(wellFormed, "Source must be well-formed Unicode")
      .refine(
        (source) =>
          encoder.encode(source).byteLength <= MAX_SYSCONFIG_SOURCE_BYTES,
        "SysConfig source exceeds 4 MiB",
      ),
    sdk_catalog: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type SysConfigSourcePayload = z.infer<
  typeof sysConfigSourcePayloadSchema
>

function gunzipBounded(bytes: Uint8Array, limit: number) {
  const chunks: Uint8Array[] = []
  let size = 0
  const decoder = new Gunzip((chunk) => {
    size += chunk.byteLength
    if (size > limit)
      throw new Error("Encoded SysConfig exceeds its size limit")
    chunks.push(chunk)
  })
  // Bound each inflate step as well as the total; never inflate the full input first.
  for (let offset = 0; offset < bytes.length; offset += 1024)
    decoder.push(
      bytes.subarray(offset, offset + 1024),
      offset + 1024 >= bytes.length,
    )
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

/** Portable browser/Bun codec. The fragment contains source, never executable HTML. */
export async function encodeSysConfigHash(
  input: SysConfigSourcePayload,
): Promise<string> {
  const payload = sysConfigSourcePayloadSchema.parse(input)
  const json = encoder.encode(JSON.stringify(payload))
  if (json.byteLength > MAX_JSON_BYTES)
    throw new Error("Encoded SysConfig exceeds its size limit")
  const bytes = gzipSync(json, { level: 6, mtime: 0 })
  if (bytes.length > MAX_COMPRESSED_BYTES)
    throw new Error("Encoded SysConfig exceeds its size limit")
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return SYSCONFIG_HASH_PREFIX + btoa(binary)
}

export async function decodeSysConfigHash(
  hash: string,
): Promise<SysConfigSourcePayload> {
  if (!hash.startsWith(SYSCONFIG_HASH_PREFIX))
    throw new Error("Expected a SysConfig gzip/base64 URL fragment")
  const encoded = hash.slice(SYSCONFIG_HASH_PREFIX.length)
  if (
    !encoded ||
    encoded.length > 4 * Math.ceil(MAX_COMPRESSED_BYTES / 3) ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  )
    throw new Error("Invalid or oversized SysConfig base64 content")
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  let json: string
  try {
    const decompressed = gunzipBounded(bytes, MAX_JSON_BYTES)
    json = new TextDecoder("utf-8", { fatal: true }).decode(decompressed)
  } catch (error) {
    throw new Error("Invalid, oversized, or non-UTF-8 SysConfig gzip content", {
      cause: error,
    })
  }
  return sysConfigSourcePayloadSchema.parse(JSON.parse(json))
}

export async function createSysConfigViewerUrl(
  payload: SysConfigSourcePayload,
  baseUrl: string,
): Promise<string> {
  const url = new URL(baseUrl)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "The SysConfig viewer requires an HTTP(S) URL without credentials",
    )
  url.hash = await encodeSysConfigHash(payload)
  return url.href
}
