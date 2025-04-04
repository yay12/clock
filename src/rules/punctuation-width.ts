/**
 * @fileoverview
 *
 * This rule will format each punctuation into the right width options.
 *
 * Options:
 * - halfwidthPunctuation: string = `()[]{}`
 * - fullwidthPunctuation: string = `，。：；？！“”‘’`
 * - adjustedFullwidthPunctuation: string = `“”‘’`
 *
 * Details:
 * - skip half-width punctuations between half-width content without space
 * - skip successive multiple half-width punctuations
 */

import {
  GroupTokenType,
  Handler,
  MutableGroupToken,
  MutableToken,
  HyperTokenType,
  isSinglePunctuationType,
  getFullwidthTokenType,
  getHalfwidthTokenType
} from '../parser/index.js'
import { PUNCTUATION_FULL_WIDTH, PUNCTUATION_HALF_WIDTH } from './messages.js'
import {
  checkValue,
  checkEndValue,
  checkStartValue,
  isHalfwidthPunctuationWithoutSpaceAround,
  isSuccessiveHalfwidthPunctuation,
  Options
} from './util.js'

type WidthPairList = Array<[halfwidth: string, fullwidth: string]>
type WidthSidePairList = Array<
  [halfwidth: string, fullwidthLeftSide: string, fullwidthRightSide: string]
>
type AlterMap = Record<string, string>
type AlterPairMap = Record<string, [leftSide: string, rightSide: string]>

let widthPairList: WidthPairList = [
  [`,`, `，`],
  [`.`, `。`],
  [`;`, `；`],
  [`:`, `：`],
  [`?`, `？`],
  [`!`, `！`],
  [`(`, `（`],
  [`)`, `）`],
  [`[`, `［`],
  [`]`, `］`],
  [`{`, `｛`],
  [`}`, `｝`]
]
let widthSidePairList: WidthSidePairList = [
  [`"`, `“`, `”`],
  [`'`, `‘`, `’`]
]

let defaultHalfwidthOption = `()[]{}`
let defaultFullwidthOption = `，。：；？！“”‘’`
let defaultAdjustedFullwidthOption = `“”‘’`

let checkAdjusted = (token: MutableToken, adjusted: string): void => {
  if (adjusted.indexOf(token.modifiedValue) >= 0) {
    token.modifiedType = getHalfwidthTokenType(token.type)
  }
}

let parseOptions = (
  options: Options
): {
  halfwidthMap: AlterMap
  fullwidthMap: AlterMap
  fullwidthPairMap: AlterPairMap
  adjusted: string
} => {
  let halfwidthOption = options?.halfwidthPunctuation || ''
  let fullwidthOption = options?.fullwidthPunctuation || ''
  let adjustedFullwidthOption = options?.adjustedFullwidthPunctuation || ''

  let halfwidthMap: AlterMap = {}
  let fullwidthMap: AlterMap = {}
  let fullwidthPairMap: AlterPairMap = {}

  widthPairList.forEach(([halfwidth, fullwidth]) => {
    if (halfwidthOption.indexOf(halfwidth) >= 0) {
      halfwidthMap[fullwidth] = halfwidth
    }
    if (fullwidthOption.indexOf(fullwidth) >= 0) {
      fullwidthMap[halfwidth] = fullwidth
    }
  })
  widthSidePairList.forEach(([half, left, right]) => {
    if (halfwidthOption.indexOf(half) >= 0) {
      halfwidthMap[left] = half
      halfwidthMap[right] = half
    }
    if (
      fullwidthOption.indexOf(left) >= 0 ||
      fullwidthOption.indexOf(right) >= 0
    ) {
      fullwidthPairMap[half] = [left, right]
    }
  })

  return {
    halfwidthMap,
    fullwidthMap,
    fullwidthPairMap,
    adjusted: adjustedFullwidthOption
  }
}

let generateHandler = (options: Options): Handler => {
  let { halfwidthMap, fullwidthMap, fullwidthPairMap, adjusted } =
    parseOptions(options)

  let handleHyperSpaceOption: Handler = (
    token: MutableToken,
    _,
    group: MutableGroupToken
  ) => {
    // skip non-punctuation/quotation/bracket situations
    if (
      !isSinglePunctuationType(token.type) &&
      token.type !== HyperTokenType.BRACKET_MARK &&
      token.type !== GroupTokenType.GROUP
    ) {
      return
    }

    // skip halfwidth punctuations between halfwidth content without space
    if (isHalfwidthPunctuationWithoutSpaceAround(group, token)) {
      return
    }

    // skip successive multiple half-width punctuations
    if (isSuccessiveHalfwidthPunctuation(group, token)) {
      return
    }

    // 1. normal punctuations in the alter width map
    // 2. brackets in the alter width map
    if (
      isSinglePunctuationType(token.type) ||
      token.type === HyperTokenType.BRACKET_MARK
    ) {
      let value = token.modifiedValue
      if (fullwidthMap[value]) {
        checkValue(
          token,
          fullwidthMap[value],
          getFullwidthTokenType(token.type),
          PUNCTUATION_FULL_WIDTH
        )
        checkAdjusted(token, adjusted)
      } else if (halfwidthMap[value]) {
        checkValue(
          token,
          halfwidthMap[value],
          getHalfwidthTokenType(token.type),
          PUNCTUATION_HALF_WIDTH
        )
      }
      return
    }

    // 3. quotations in the alter pair map
    let startValue = (token as MutableGroupToken).modifiedStartValue
    let endValue = (token as MutableGroupToken).modifiedEndValue
    if (fullwidthPairMap[startValue]) {
      checkStartValue(
        token,
        fullwidthPairMap[startValue][0],
        PUNCTUATION_FULL_WIDTH
      )
    } else if (halfwidthMap[startValue]) {
      checkStartValue(
        token,
        halfwidthMap[startValue][0],
        PUNCTUATION_HALF_WIDTH
      )
    }
    if (fullwidthPairMap[endValue]) {
      checkEndValue(
        token,
        fullwidthPairMap[endValue][1],
        PUNCTUATION_FULL_WIDTH
      )
    } else if (halfwidthMap[endValue]) {
      checkEndValue(token, halfwidthMap[endValue][1], PUNCTUATION_HALF_WIDTH)
    }
  }
  return handleHyperSpaceOption
}

export let defaultConfig: Options = {
  halfwidthPunctuation: defaultHalfwidthOption,
  fullwidthPunctuation: defaultFullwidthOption,
  adjustedFullwidthPunctuation: defaultAdjustedFullwidthOption
}

export default generateHandler
