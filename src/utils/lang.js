// 判断文本语言：含中日韩统一表意文字 -> 'zh'，否则 'en'
export function isZh(text) {
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一汉字
      (code >= 0x3040 && code <= 0x30ff) || // 日文假名
      (code >= 0xac00 && code <= 0xd7af)    // 韩文
    ) {
      return true
    }
  }
  return false
}

export function langOf(text) {
  return isZh(text) ? 'zh' : 'en'
}
