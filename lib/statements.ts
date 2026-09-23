import { SysConfigNode } from "./base-node"
import {
  SysConfigCall,
  type SysConfigExpression,
  SysConfigLiteral,
  SysConfigReference,
  type SysConfigValueInput,
  toExpression,
} from "./expressions"

export type DeclarationKind = "const" | "let" | "var"
export class SysConfigDeclaration extends SysConfigNode {
  readonly type: string = "declaration"
  name: string
  kind: DeclarationKind
  value: SysConfigExpression
  constructor(init: {
    name: string
    value: SysConfigValueInput
    kind?: DeclarationKind
  }) {
    super()
    this.name = init.name
    this.kind = init.kind ?? "const"
    this.value = toExpression(init.value)
  }
  getChildren(): SysConfigNode[] {
    return [this.value]
  }
  protected signature(): string {
    return JSON.stringify([this.name, this.kind])
  }
  protected render(): string {
    return `${this.kind} ${this.name} = ${this.value.toSource()};`
  }
}

export class SysConfigModule extends SysConfigDeclaration {
  override readonly type = "module"
  constructor(init: {
    name: string
    modulePath: string
    arguments?: SysConfigValueInput[]
    scriptingName?: "scripting" | "script"
    kind?: DeclarationKind
  }) {
    super({
      name: init.name,
      kind: init.kind,
      value: new SysConfigCall({
        callee: `${init.scriptingName ?? "scripting"}.addModule`,
        arguments: [init.modulePath, ...(init.arguments ?? [])],
      }),
    })
  }
  get modulePath(): string | undefined {
    const arg =
      this.value instanceof SysConfigCall ? this.value.arguments[0] : undefined
    return arg instanceof SysConfigLiteral && typeof arg.value === "string"
      ? arg.value
      : undefined
  }
}

export class SysConfigInstance extends SysConfigDeclaration {
  override readonly type = "instance"
  constructor(init: {
    name: string
    moduleName: string
    arguments?: SysConfigValueInput[]
    kind?: DeclarationKind
  }) {
    super({
      name: init.name,
      kind: init.kind,
      value: new SysConfigCall({
        callee: new SysConfigReference({
          path: [init.moduleName, "addInstance"],
        }),
        arguments: init.arguments,
      }),
    })
  }
  get moduleName(): string | undefined {
    return this.value instanceof SysConfigCall
      ? String(this.value.callee.path[0])
      : undefined
  }
}

export class SysConfigAssignment extends SysConfigNode {
  readonly type = "assignment"
  target: SysConfigReference
  value: SysConfigExpression
  constructor(init: {
    target: string | SysConfigReference
    value: SysConfigValueInput
  }) {
    super()
    this.target =
      typeof init.target === "string"
        ? new SysConfigReference({ path: init.target })
        : init.target
    this.value = toExpression(init.value)
  }
  getChildren(): SysConfigNode[] {
    return [this.target, this.value]
  }
  protected render(): string {
    return `${this.target.toSource()} = ${this.value.toSource()};`
  }
}

export class UnknownSysConfigStatement extends SysConfigNode {
  readonly type = "unknown-statement"
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

/** A standalone SysConfig API call, such as a collection's create(count). */
export class SysConfigCallStatement extends SysConfigNode {
  readonly type = "call-statement"
  call: SysConfigCall
  constructor(init: { call: SysConfigCall }) {
    super()
    this.call = init.call
  }
  getChildren(): SysConfigNode[] {
    return [this.call]
  }
  protected render(): string {
    return `${this.call.toSource()};`
  }
}
