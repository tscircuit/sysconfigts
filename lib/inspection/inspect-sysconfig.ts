import { SysConfigTrivia } from "../base-node"
import { SysConfigReference } from "../expressions"
import {
  SysConfigAssignment,
  SysConfigCallStatement,
  SysConfigDeclaration,
  SysConfigInstance,
  SysConfigModule,
} from "../statements"
import type { SysConfig } from "../sysconfig"

export interface SysConfigInspectionRow {
  kind:
    | "module"
    | "instance"
    | "assignment"
    | "fixed_assignment"
    | "suggested_assignment"
    | "declaration"
    | "call"
    | "unknown_statement"
  target: string
  expression: string
}

function getAssignmentKind(assignment: SysConfigAssignment) {
  switch (assignment.target.path.at(-1)) {
    case "$assign":
      return "fixed_assignment"
    case "$suggestSolution":
      return "suggested_assignment"
    default:
      return "assignment"
  }
}

/** Ordered textual facts, not an evaluated device configuration. No aliases are resolved. */
export function inspectSysConfig(config: SysConfig): SysConfigInspectionRow[] {
  return config.nodes.flatMap((node): SysConfigInspectionRow[] => {
    if (node instanceof SysConfigTrivia) return []
    if (node instanceof SysConfigAssignment) {
      return [
        {
          kind: getAssignmentKind(node),
          target: new SysConfigReference({ path: node.target.path }).toSource(),
          expression: node.value.toSource(),
        },
      ]
    }
    if (node instanceof SysConfigDeclaration) {
      return [
        {
          kind:
            node instanceof SysConfigModule
              ? "module"
              : node instanceof SysConfigInstance
                ? "instance"
                : "declaration",
          target: node.name,
          expression: node.value.toSource(),
        },
      ]
    }
    return [
      {
        kind:
          node instanceof SysConfigCallStatement ? "call" : "unknown_statement",
        target: "",
        expression: node.toSource(),
      },
    ]
  })
}
