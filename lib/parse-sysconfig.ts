import {
  type Expression,
  parse,
  type Statement,
  type VariableDeclaration,
} from "acorn"
import { type SysConfigNode, SysConfigTrivia } from "./base-node"
import {
  SysConfigArray,
  SysConfigCall,
  type SysConfigExpression,
  SysConfigLiteral,
  SysConfigObject,
  SysConfigProperty,
  SysConfigReference,
  UnknownSysConfigExpression,
} from "./expressions"
import {
  SysConfigAssignment,
  SysConfigCallStatement,
  SysConfigDeclaration,
  SysConfigInstance,
  SysConfigModule,
  UnknownSysConfigStatement,
} from "./statements"
import { SysConfig } from "./sysconfig"

export class SysConfigParseError extends SyntaxError {
  override readonly name = "SysConfigParseError"
  readonly line?: number
  readonly column?: number
  constructor(message: string, location?: { line: number; column: number }) {
    super(`Invalid SysConfig JavaScript: ${message}`)
    this.line = location?.line
    this.column = location?.column
  }
}

/** Parse a .syscfg script without running it or loading any TI SDK modules. */
export function parseSysConfig(source: string): SysConfig {
  let ast: ReturnType<typeof parse>
  try {
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: "script",
      preserveParens: true,
    })
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    const location =
      "loc" in error
        ? (error.loc as { line: number; column: number })
        : undefined
    throw new SysConfigParseError(error.message, location)
  }
  function keep<T extends SysConfigNode>(
    node: T,
    syntax: { start: number; end: number },
  ): T {
    return node.preserveSource(source, syntax.start, syntax.end)
  }
  function reference(node: Expression): SysConfigReference | undefined {
    if (node.type === "Identifier")
      return keep(new SysConfigReference({ path: [node.name] }), node)
    if (
      node.type === "MemberExpression" &&
      !node.optional &&
      node.object.type !== "Super"
    ) {
      const object = reference(node.object)
      const property = node.property
      const key =
        !node.computed && property.type === "Identifier"
          ? property.name
          : node.computed &&
              property.type === "Literal" &&
              (typeof property.value === "string" ||
                typeof property.value === "number")
            ? property.value
            : undefined
      if (object && key !== undefined)
        return keep(
          new SysConfigReference({ path: [...object.path, key] }),
          node,
        )
    }
    return undefined
  }
  function expression(node: Expression): SysConfigExpression {
    const ref = reference(node)
    if (ref) return ref
    if (
      node.type === "Literal" &&
      (node.value === null ||
        ["string", "boolean", "number"].includes(typeof node.value)) &&
      !("regex" in node) &&
      (typeof node.value !== "number" || Number.isFinite(node.value))
    ) {
      return keep(
        new SysConfigLiteral({
          value: node.value as string | number | boolean | null,
        }),
        node,
      )
    }
    if (
      node.type === "UnaryExpression" &&
      node.operator === "-" &&
      node.argument.type === "Literal" &&
      typeof node.argument.value === "number" &&
      Number.isFinite(node.argument.value)
    ) {
      return keep(new SysConfigLiteral({ value: -node.argument.value }), node)
    }
    if (
      node.type === "ArrayExpression" &&
      node.elements.every(
        (item) => item !== null && item.type !== "SpreadElement",
      )
    ) {
      return keep(
        new SysConfigArray({
          items: node.elements.map((item) => expression(item as Expression)),
        }),
        node,
      )
    }
    if (node.type === "ObjectExpression") {
      const properties: SysConfigProperty[] = []
      for (const property of node.properties) {
        if (
          property.type !== "Property" ||
          property.computed ||
          property.method ||
          property.shorthand ||
          property.kind !== "init"
        )
          break
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal"
              ? String(property.key.value)
              : undefined
        if (key === undefined) break
        properties.push(
          keep(
            new SysConfigProperty({
              key,
              value: expression(property.value as Expression),
            }),
            property,
          ),
        )
      }
      if (properties.length === node.properties.length)
        return keep(new SysConfigObject({ properties }), node)
    }
    if (
      node.type === "CallExpression" &&
      !node.optional &&
      node.callee.type !== "Super" &&
      node.arguments.every((arg) => arg.type !== "SpreadElement")
    ) {
      const callee = reference(node.callee)
      if (callee)
        return keep(
          new SysConfigCall({
            callee,
            arguments: node.arguments.map((arg) =>
              expression(arg as Expression),
            ),
          }),
          node,
        )
    }
    return keep(
      new UnknownSysConfigExpression({
        source: source.slice(node.start, node.end),
      }),
      node,
    )
  }
  function declaration(
    node: VariableDeclaration,
  ): SysConfigDeclaration | undefined {
    const decl = node.declarations[0]
    if (
      node.declarations.length !== 1 ||
      !decl ||
      decl.id.type !== "Identifier" ||
      !decl.init ||
      !["var", "let", "const"].includes(node.kind)
    )
      return undefined
    const name = decl.id.name
    const kind = node.kind as "var" | "let" | "const"
    const value = expression(decl.init)
    let result = new SysConfigDeclaration({ name, kind, value })
    if (value instanceof SysConfigCall) {
      const path = value.callee.path
      const firstArg = value.arguments[0]
      if (
        path.length === 2 &&
        (path[0] === "scripting" || path[0] === "script") &&
        path[1] === "addModule" &&
        firstArg instanceof SysConfigLiteral &&
        typeof firstArg.value === "string"
      ) {
        result = new SysConfigModule({ name, kind, modulePath: firstArg.value })
      } else if (
        path.length === 2 &&
        path[1] === "addInstance" &&
        typeof path[0] === "string"
      ) {
        result = new SysConfigInstance({ name, kind, moduleName: path[0] })
      }
      result.value = value
    }
    return keep(result, node)
  }
  function statement(node: Statement): SysConfigNode {
    if (node.type === "EmptyStatement")
      return new SysConfigTrivia({ text: source.slice(node.start, node.end) })
    if (
      node.type === "ExpressionStatement" &&
      node.expression.type === "CallExpression"
    ) {
      const call = expression(node.expression)
      if (call instanceof SysConfigCall)
        return keep(new SysConfigCallStatement({ call }), node)
    }
    if (node.type === "VariableDeclaration") {
      const result = declaration(node)
      if (result) return result
    }
    if (
      node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.operator === "=" &&
      node.expression.left.type === "MemberExpression"
    ) {
      const target = reference(node.expression.left)
      if (target)
        return keep(
          new SysConfigAssignment({
            target,
            value: expression(node.expression.right),
          }),
          node,
        )
    }
    return keep(
      new UnknownSysConfigStatement({
        source: source.slice(node.start, node.end),
      }),
      node,
    )
  }
  const document = new SysConfig()
  let cursor = 0
  for (const node of ast.body) {
    if (node.start > cursor)
      document.nodes.push(
        new SysConfigTrivia({ text: source.slice(cursor, node.start) }),
      )
    document.nodes.push(statement(node as Statement))
    cursor = node.end
  }
  if (cursor < source.length)
    document.nodes.push(new SysConfigTrivia({ text: source.slice(cursor) }))
  return document
}
