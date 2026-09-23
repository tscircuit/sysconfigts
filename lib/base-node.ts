/** A source-preserving node. Children are visited in source order. */
export abstract class SysConfigNode {
  abstract readonly type: string
  private original?: {
    source: string
    start: number
    signature: string
    children: SysConfigNode[]
    ranges: { start: number; end: number }[]
  }
  /** Original UTF-16 offsets, available on parsed nodes. */
  sourceRange?: { start: number; end: number }
  abstract getChildren(): SysConfigNode[]
  protected abstract render(): string
  protected signature(): string {
    return this.type
  }

  /** @internal Called by the parser after children have been constructed. */
  preserveSource(source: string, start: number, end: number): this {
    this.sourceRange = { start, end }
    const children = this.getChildren()
    this.original = {
      source: source.slice(start, end),
      start,
      signature: this.signature(),
      children: [...children],
      ranges: children.map((child) => ({ ...child.sourceRange! })),
    }
    return this
  }

  toSource(): string {
    const original = this.original
    const children = this.getChildren()
    if (
      original &&
      original.signature === this.signature() &&
      children.length === original.children.length
    ) {
      let result = ""
      let cursor = 0
      for (let i = 0; i < children.length; i++) {
        const range = original.ranges[i]!
        result += original.source.slice(cursor, range.start - original.start)
        result += children[i]!.toSource()
        cursor = range.end - original.start
      }
      return result + original.source.slice(cursor)
    }
    return this.render()
  }
}

export class SysConfigTrivia extends SysConfigNode {
  readonly type = "trivia"
  text: string
  constructor(init: { text: string }) {
    super()
    this.text = init.text
  }
  getChildren(): SysConfigNode[] {
    return []
  }
  protected signature(): string {
    return this.text
  }
  protected render(): string {
    return this.text
  }
}
