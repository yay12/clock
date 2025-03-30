import { ParsedStatus } from './types.js'

// {% x y %}z{% endx %}
// \{\% ([^ ]+?) [^\%]*?\%\}    ([^ ]+?)        [^\%]*?
// (?:\n|\{(?!\%)|[^\{])*?      \n              \{(?!\%)        [^\{]
// \{\% end(?:\1) \%\}
let matcher = /\{% ([^ ]+?) [^%]*?%\}(?:\n|\{(?!%)|[^{])*?\{% end(?:\1) %\}/g

let parser = (data: ParsedStatus): ParsedStatus => {
  data.modifiedValue = data.modifiedValue.replace(
    matcher,
    (raw, name, index) => {
      let { length } = raw
      data.ignoredByParsers.push({
        name,
        meta: `hexo-${name}`,
        index,
        length,
        originValue: raw
      })
      return '@'.repeat(length)
    }
  )
  return data
}

export default parser
