import { SysConfigNode, SysConfigTrivia } from "./base-node"
import {
  SysConfigReference,
  type SysConfigValueInput,
  UnknownSysConfigExpression,
} from "./expressions"
import {
  SysConfigAssignment,
  SysConfigInstance,
  SysConfigModule,
  UnknownSysConfigStatement,
} from "./statements"

export class SysConfig extends SysConfigNode {
  readonly type = "sysconfig"
  /** Ordered statements and trivia. Reordering statements can change script behavior. */
  nodes: SysConfigNode[] = []
  constructor(init: { nodes?: SysConfigNode[] } = {}) {
    super()
    for (const node of init.nodes ?? []) this.add(node)
  }
  getChildren(): SysConfigNode[] {
    return this.nodes
  }
  protected render(): string {
    return this.nodes.map((node) => node.toSource()).join("")
  }
  getString(): string {
    return this.toSource()
  }
  get modules(): SysConfigModule[] {
    return this.nodes.filter(
      (node): node is SysConfigModule => node instanceof SysConfigModule,
    )
  }
  get instances(): SysConfigInstance[] {
    return this.nodes.filter(
      (node): node is SysConfigInstance => node instanceof SysConfigInstance,
    )
  }
  get assignments(): SysConfigAssignment[] {
    return this.nodes.filter(
      (node): node is SysConfigAssignment =>
        node instanceof SysConfigAssignment,
    )
  }
  /** Unknown syntax is preserved, but cannot be used as a resolved configuration. */
  get unknownNodes(): (
    | UnknownSysConfigStatement
    | UnknownSysConfigExpression
  )[] {
    const result: (UnknownSysConfigStatement | UnknownSysConfigExpression)[] =
      []
    const visit = (node: SysConfigNode) => {
      if (
        node instanceof UnknownSysConfigStatement ||
        node instanceof UnknownSysConfigExpression
      )
        result.push(node)
      for (const child of node.getChildren()) visit(child)
    }
    for (const node of this.nodes) visit(node)
    return result
  }
  /** Last top-level textual assignment. Does not evaluate control flow or aliases. */
  getAssignment(
    target: string | SysConfigReference,
  ): SysConfigAssignment | undefined {
    const reference =
      typeof target === "string"
        ? new SysConfigReference({ path: target })
        : target
    return this.assignments.findLast((assignment) =>
      assignment.target.equals(reference),
    )
  }
  setValue(
    target: string | SysConfigReference,
    value: SysConfigValueInput,
  ): SysConfigAssignment {
    const assignment = new SysConfigAssignment({ target, value })
    const existing = this.getAssignment(target)
    if (existing) {
      existing.value = assignment.value
      return existing
    }
    return this.add(assignment)
  }
  add<T extends SysConfigNode>(node: T): T {
    // A semicolon also prevents ASI hazards after arbitrary preserved JavaScript.
    if (this.nodes.length)
      this.nodes.push(
        new SysConfigTrivia({
          text: this.getString().trimEnd().endsWith(";") ? "\n" : "\n;\n",
        }),
      )
    this.nodes.push(node)
    return node
  }
  addModule(
    init: ConstructorParameters<typeof SysConfigModule>[0],
  ): SysConfigModule {
    return this.add(new SysConfigModule(init))
  }
  addInstance(
    init: ConstructorParameters<typeof SysConfigInstance>[0],
  ): SysConfigInstance {
    return this.add(new SysConfigInstance(init))
  }
}
