import { SysConfigTrivia } from "../base-node"
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
    | "metadata"
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

function inspectMetadata(trivia: SysConfigTrivia): SysConfigInspectionRow[] {
  const rows: SysConfigInspectionRow[] = []
  const comments = trivia
    .toSource()
    .matchAll(/\/\*([\s\S]*?)\*\/|\/\/([^\r\n]*)/g)
  for (const comment of comments) {
    const commentText = comment[1] ?? comment[2]!
    for (const line of commentText.split(/\r\n|\r|\n/)) {
      const header = line.match(
        /^\s*\*?\s*(@(?:cliArgs|v2CliArgs|versions))(?=\s|$)(.*)$/,
      )
      if (header) {
        rows.push({
          kind: "metadata",
          target: header[1]!,
          expression: header[2]!.trim(),
        })
      }
    }
  }
  return rows
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
    if (node instanceof SysConfigTrivia) return inspectMetadata(node)
    if (node instanceof SysConfigAssignment) {
      return [
        {
          kind: getAssignmentKind(node),
          target: node.target.toSource(),
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
