import { SysConfigNode } from "./base-node"

export abstract class SysConfigExpression extends SysConfigNode {}
export type SysConfigPrimitive = string | number | boolean | null
export type SysConfigValueInput =
  | SysConfigPrimitive
  | SysConfigExpression
  | SysConfigValueInput[]
  | { [key: string]: SysConfigValueInput }

export class SysConfigLiteral extends SysConfigExpression {
  readonly type = "literal"
  value: SysConfigPrimitive
  constructor(init: { value: SysConfigPrimitive }) {
    super()
    this.value = init.value
  }
  getChildren(): SysConfigNode[] {
    return []
  }
  protected signature(): string {
    return this.render()
  }
  protected render(): string {
    if (typeof this.value === "number") {
      if (!Number.isFinite(this.value))
        throw new TypeError("SysConfig numbers must be finite")
      if (Object.is(this.value, -0)) return "-0"
    }
    return JSON.stringify(this.value)
  }
}

/** Static identifier/property paths, including $assign and array indices. */
export class SysConfigReference extends SysConfigExpression {
  readonly type = "reference"
  path: (string | number)[]
  constructor(init: { path: string | (string | number)[] }) {
    super()
    this.path =
      typeof init.path === "string" ? init.path.split(".") : [...init.path]
  }
  getChildren(): SysConfigNode[] {
    return []
  }
  protected signature(): string {
    return JSON.stringify(this.path)
  }
  protected render(): string {
    const [head, ...tail] = this.path
    if (typeof head !== "string" || !/^[$A-Z_a-z][$\w]*$/.test(head))
      throw new TypeError("A reference must start with an identifier")
    return (
      head +
      tail
        .map((key) =>
          typeof key === "string" && /^[$A-Z_a-z][$\w]*$/.test(key)
            ? `.${key}`
            : `[${JSON.stringify(key)}]`,
        )
        .join("")
    )
  }
  equals(other: SysConfigReference): boolean {
    return JSON.stringify(this.path) === JSON.stringify(other.path)
  }
}

export class SysConfigArray extends SysConfigExpression {
  readonly type = "array"
  items: SysConfigExpression[]
  constructor(init: { items?: SysConfigValueInput[] } = {}) {
    super()
    this.items = (init.items ?? []).map(toExpression)
  }
  getChildren(): SysConfigNode[] {
    return this.items
  }
  protected render(): string {
    return `[${this.items.map((item) => item.toSource()).join(", ")}]`
  }
}

export class SysConfigProperty extends SysConfigNode {
  readonly type = "property"
  key: string
  value: SysConfigExpression
  constructor(init: { key: string; value: SysConfigValueInput }) {
    super()
    this.key = init.key
    this.value = toExpression(init.value)
  }
  getChildren(): SysConfigNode[] {
    return [this.value]
  }
  protected signature(): string {
    return this.key
  }
  protected render(): string {
    return `${JSON.stringify(this.key)}: ${this.value.toSource()}`
  }
}

export class SysConfigObject extends SysConfigExpression {
  readonly type = "object"
  properties: SysConfigProperty[]
  constructor(init: { properties?: SysConfigProperty[] } = {}) {
    super()
    this.properties = init.properties ?? []
  }
  getChildren(): SysConfigNode[] {
    return this.properties
  }
  protected render(): string {
    return `{${this.properties.map((property) => property.toSource()).join(", ")}}`
  }
}

export class SysConfigCall extends SysConfigExpression {
  readonly type = "call"
  callee: SysConfigReference
  arguments: SysConfigExpression[]
  constructor(init: {
    callee: SysConfigReference | string
    arguments?: SysConfigValueInput[]
  }) {
    super()
    this.callee =
      typeof init.callee === "string"
        ? new SysConfigReference({ path: init.callee })
        : init.callee
    this.arguments = (init.arguments ?? []).map(toExpression)
  }
  getChildren(): SysConfigNode[] {
    return [this.callee, ...this.arguments]
  }
  protected render(): string {
    return `${this.callee.toSource()}(${this.arguments.map((arg) => arg.toSource()).join(", ")})`
  }
}

/** Preserved JavaScript that is not statically interpreted. Never executed. */
export class UnknownSysConfigExpression extends SysConfigExpression {
  readonly type = "unknown-expression"
  source: string
  constructor(init: { source: string }) {
    super()
    this.source = init.source
  }
  getChildren(): SysConfigNode[] {
    return []
  }
  protected signature(): string {
    return this.source
  }
  protected render(): string {
    return this.source
  }
}

export function toExpression(value: SysConfigValueInput): SysConfigExpression {
  if (value instanceof SysConfigExpression) return value
  if (Array.isArray(value)) return new SysConfigArray({ items: value })
  if (value !== null && typeof value === "object") {
    return new SysConfigObject({
      properties: Object.keys(value)
        .sort()
        .map((key) => new SysConfigProperty({ key, value: value[key]! })),
    })
  }
  return new SysConfigLiteral({ value })
}
