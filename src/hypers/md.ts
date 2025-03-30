import { unified } from 'unified'
import markdown from 'remark-parse'
import gfm from 'remark-gfm'
import frontmatter from 'remark-frontmatter'
import * as Ast from 'mdast'
import { Node, Position } from 'unist'
import {
  isRawMark,
  Mark,
  MarkSideType,
  MarkType,
  RawMark
} from '../parser/index.js'
import { Block, ParsedStatus } from './types.js'

// Position related

type NormalizedPosition = {
  start: number
  end: number
}

let parsePosition = (position?: Position): NormalizedPosition => ({
  start: position?.start?.offset || 0,
  end: position?.end?.offset || 0
})

// AST related

let isParent = (node: Node): node is Ast.Parent => {
  return (node as Ast.Parent).children !== undefined
}

type BlockType = Ast.Paragraph | Ast.Heading | Ast.TableCell
let blockTypes: string[] = ['paragraph', 'heading', 'table-cell']
let isBlock = (node: Node): node is BlockType => {
  return blockTypes.indexOf(node.type) >= 0
}

type InlineContentType =
  | Ast.Emphasis
  | Ast.Strong
  | Ast.Delete
  | Ast.Link
  | Ast.LinkReference
let inlineContentTypes: string[] = [
  'emphasis',
  'strong',
  'delete',
  'link',
  'linkReference'
]
let isInlineContent = (node: Node): node is InlineContentType => {
  return inlineContentTypes.indexOf(node.type) >= 0
}

type InlineRawType =
  | Ast.InlineCode
  | Ast.Break
  | Ast.Image
  | Ast.ImageReference
  | Ast.FootnoteDefinition
  | Ast.Html
let inlineRawTypes: string[] = [
  'inlineCode',
  'break',
  'image',
  'imageReference',
  'footnoteDefinition',
  'html'
]
let isInlineRaw = (node: Node): node is InlineRawType => {
  return inlineRawTypes.indexOf(node.type) >= 0
}

// Marks related

type BlockMark = {
  block: BlockType
  inlineMarks: InlineMark[]
  hyperMarks: Mark[]
  value: string
}

type InlineMark = {
  inline: InlineContentType | InlineRawType
  raw: boolean
}

let travelBlocks = (node: Node, blocks: BlockMark[]): void => {
  if (isParent(node)) {
    node.children.forEach((child) => {
      if (child.type === 'yaml') {
        return
      }
      if (isBlock(child)) {
        let blockMark: BlockMark = {
          block: child,
          inlineMarks: [],
          hyperMarks: [],
          value: '' // to be initialzed
        }
        blocks.push(blockMark)
        travelInlines(child, blockMark)
      } else {
        travelBlocks(child, blocks)
      }
    })
  }
}

let travelInlines = (node: Node, blockMark: BlockMark): void => {
  if (isParent(node)) {
    node.children.forEach((child) => {
      if (isInlineContent(child)) {
        blockMark.inlineMarks.push({ inline: child, raw: false })
        travelInlines(child, blockMark)
      }
      if (isInlineRaw(child)) {
        blockMark.inlineMarks.push({ inline: child, raw: true })
      }
    })
  }
}

let processBlockMark = (blockMark: BlockMark, str: string): void => {
  let { block, inlineMarks } = blockMark
  if (!block.position) {
    return
  }
  let offset = block.position.start.offset || 0

  let marks: Mark[] = []
  let unresolvedCodeMarks: RawMark[] = []

  // Generate all the marks includes hyper (inline) and raw.
  inlineMarks.forEach((inlineMark) => {
    let { inline } = inlineMark
    if (!inline.position) {
      return
    }
    let startOffset = inline.position.start.offset || 0
    let endOffset = inline.position.end.offset || 0

    if (isInlineRaw(inline)) {
      let mark: Mark = {
        type: MarkType.RAW,
        // TODO: typeof RawMark.meta
        meta: inline.type,
        startIndex: startOffset - offset,
        endIndex: endOffset - offset,
        startValue: str.substring(startOffset, endOffset),
        endValue: ''
      }
      // TODO: Ast.InlineCode?
      if (mark.startValue.match(/<code.*>/)) {
        let rawMark: RawMark = { ...mark, code: MarkSideType.LEFT }
        unresolvedCodeMarks.push(rawMark)
        marks.push(rawMark)
        return
      } else if (mark.startValue.match(/<\/code.*>/)) {
        let rawMark: RawMark = { ...mark, code: MarkSideType.RIGHT }
        let leftCode = unresolvedCodeMarks.pop()
        if (leftCode) {
          leftCode.rightPair = rawMark
        }
        marks.push(rawMark)
        return
      }
      marks.push(mark)
    } else {
      let firstChild = inline.children[0]
      let lastChild = inline.children[inline.children.length - 1]
      if (!firstChild.position || !lastChild.position) {
        return
      }
      let innerStartOffset = firstChild.position.start.offset || 0
      let innerEndOffset = lastChild.position.end.offset || 0
      let mark: Mark = {
        type: MarkType.HYPER,
        // TODO: typeof RawMark.meta
        meta: inline.type,
        startIndex: startOffset - offset,
        startValue: str.substring(startOffset, innerStartOffset),
        endIndex: innerEndOffset - offset,
        endValue: str.substring(innerEndOffset, endOffset)
      }
      marks.push(mark)
    }
  })

  blockMark.value = str.substring(
    block.position.start.offset || 0,
    block.position.end.offset || 0
  )

  blockMark.hyperMarks = marks
    .map((mark) => {
      if (isRawMark(mark)) {
        if (mark.code === MarkSideType.RIGHT) {
          return
        }
        if (mark.code === MarkSideType.LEFT) {
          let { rightPair } = mark
          mark.startValue = str.substring(
            mark.startIndex + offset,
            mark.endIndex + offset
          )
          mark.endIndex = rightPair?.endIndex || 0
          mark.endValue = ''
          delete mark.rightPair
        }
      }
      return mark
    })
    .filter(Boolean) as Mark[]
}

/**
  - travel all blocks/lists/tables/rows/cells
    - content: paragraph/heading/table-cell
    - no content: thematic break/code/html
  - for all phrasings:
    - no text: inline code/break/image/image ref/footnote ref/html
    - marks: emphasis/strong/delete/footnote/link/link ref
 */
let parser = (data: ParsedStatus): ParsedStatus => {
  let value = data.value
  let modifiedValue = data.modifiedValue
  let ignoredByParsers = data.ignoredByParsers

  let blockMarks: BlockMark[] = []

  let tree: Ast.Root = unified()
    .use(markdown)
    .use(gfm)
    .use(frontmatter)
    .parse(modifiedValue) as Ast.Root

  // - travel and record all paragraphs/headings/table-cells into blocks
  // - for each block, travel and record all
  // - - 'hyper' marks: emphasis/strong/delete/footnote/link/linkRef and continue
  // - - 'raw' marks: inlineCode/break/image/imageRef/footnoteRef/html and stop
  travelBlocks(tree, blockMarks)

  // for each block marks
  // - get block.start.offset
  // - for each marks
  // - - startIndex: mark.start.offset - offset
  // - - startValue: [mark.start.offset - offset, mark.firstChild.start.offset - offset]
  // - - endIndex: mark.lastChild.end.offset - offset
  // - - endValue: [mark.lastChild.end.offset - offset, mark.end.offset]
  blockMarks.forEach((blockMark) => processBlockMark(blockMark, value))
  data.blocks = blockMarks.map((b): Block => {
    let position = parsePosition(b.block.position)
    ignoredByParsers.forEach(({ index, length, originValue: raw, meta }) => {
      if (position.start <= index && position.end >= index + length) {
        if (b.hyperMarks) {
          b.hyperMarks.push({
            type: MarkType.RAW,
            meta,
            startIndex: index - position.start,
            startValue: raw,
            endIndex: index - position.start + length,
            endValue: ''
          })
        }
      }
    })
    return {
      value: b.value || '',
      marks: b.hyperMarks || [],
      ...position
    }
  })
  data.ignoredByParsers = []
  return data
}

export default parser
