#!/usr/bin/env node
// 通用 OCR JSON 整理脚本（12 shoe 鞋子 专用确定性版本见 tmp_sort_12.cjs）
//
// 用法:
//   node ocr_sort.cjs "<源文件.json>" [输出文件.json]
// 例:
//   node ocr_sort.cjs "../data/13 book 书.json"
//   不传输出文件时，默认写到 <源文件名>_new.json
//
// 处理规则:
//   1. 合并：同一文本框被 OCR 拆成多行的，按位置与标点判断合并为一条
//   2. 配对：位置相邻的中英文按语义配对，输出「中文在前、对应英文在后」
//   3. 排序：按每组整体位置的纵向顺序（阅读顺序）排列
//   4. 特例：最顶行标题/编号置顶（标题在前）；配对后仍孤立的顶部英文短词视作主题词置尾
//   5. 格式：字段结构与原文件完全一致，text_count 保持原值不变

const fs = require('fs')

// ---------------- 可调参数（均为归一化坐标，相对图片宽/高） ----------------
const P = {
  mergeGapDown: 0.03,     // 多行合并：允许的最大下间距
  mergeOverlapX: 0.5,     // 多行合并：最小水平重叠率
  mergeMinHRatio: 0.7,    // 多行合并：最小行高比（同一文本的换行行高接近）
  newSentWords: 3,        // 多行合并：下一行以大写开头且词数不少于此值 → 视为新句子，不合并
  pairMaxGap: 0.025,      // 中英配对：允许的最大垂直间隙
  pairMinOverlapX: 0.3,   // 中英配对：最小水平重叠率
  pairMaxDx: 0.1,         // 中英配对：水平重叠不足时允许的最大中心横距
  topRowMaxY: 0.01,       // 最顶行判定：y 小于此值
  titleMinW: 0.3,         // 标题判定：中文块宽度大于此值
  numMaxW: 0.2,           // 编号判定：非中文块宽度小于此值
  topicMaxBottom: 0.2,    // 主题词候选：英文块 y + h 小于此值
  topicMaxWords: 4,       // 主题词候选：单词数不超过此值（兼顾 "Take off your socks" 这类多词主题）
  topicMinH: 0.035,       // 主题词候选：最小高度（主题词字号最大；可排除 ON/Z/12/书脊 等小号标注）
  topicMaxX: 0.3,         // 主题词候选：位于左侧区域（排除钟表数字、开关 ON/OFF 等右侧标注）
  topicYGroup: 0.02,      // 主题词候选：只取最靠上的一组（y 容差）——主题词位于标题正下方
  useBand: false          // 排序方式：false=按整体纵向顺序；true=先纵向分带、同带内从左到右
}

const r5 = n => Math.round(n * 1e5) / 1e5

// 含中日韩文字视为中文
function isZh(text) {
  for (const ch of text) {
    const c = ch.codePointAt(0)
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff) || (c >= 0xac00 && c <= 0xd7af)) return true
  }
  return false
}

const bottom = t => t.y + t.h
const right = t => t.x + t.w
const centerX = t => t.x + t.w / 2
const centerY = t => t.y + t.h / 2

// 水平重叠率（重叠长度 / 较窄者的宽度）
function overlapX(a, b) {
  const inter = Math.min(right(a), right(b)) - Math.max(a.x, b.x)
  return inter > 0 ? inter / Math.min(a.w, b.w) : 0
}

// 是否已以终结标点收尾（用于判断是否还有后续行）
const END_RE = /[.。!！?？…,，;；:：)）"']$/
const endsClosed = t => END_RE.test(t.text.trim().slice(-1) || ' ')

// 一组块的整体包围盒
function unionBox(list) {
  const minX = Math.min(...list.map(t => t.x))
  const minY = Math.min(...list.map(t => t.y))
  return {
    x: r5(minX),
    y: r5(minY),
    w: r5(Math.max(...list.map(right)) - minX),
    h: r5(Math.max(...list.map(bottom)) - minY)
  }
}

// 合并同语言内被拆成多行的文本块（protectedIds 中的主题词候选不参与合并）
// 判断 b 是否可作为 a 的换行续行（a 在上、b 在下）
function canMerge(a, b) {
  if (isZh(b.text) !== isZh(a.text)) return false   // 不跨语言合并
  if (b.y < a.y) return false                       // b 需在 a 下方
  // 换行续行不会以大写开头；下一行以大写开头且成句 -> 是新句子（如主题词下方的例句），不合并
  // 词数少的仍允许合并，以保留 "Towel"+"Bar"、"BUS"+"STOP" 这类短语拼合
  if (!isZh(b.text) && /^[A-Z]/.test(b.text.trim()) &&
      b.text.trim().split(/\s+/).length >= P.newSentWords) return false
  const gap = b.y - bottom(a)
  if (gap > P.mergeGapDown) return false            // 离得太远
  if (gap < -0.5 * Math.min(a.h, b.h)) return false // 重叠过多，本就是同一行
  // 行高需接近：同一文本换行后行高一致
  if (Math.min(a.h, b.h) / Math.max(a.h, b.h) < P.mergeMinHRatio) return false
  if (overlapX(a, b) < P.mergeOverlapX) return false
  return true
}

// 找出「续行」块：能被上方某块合并、作为其换行延续的块
// 续行本身属于句子，不可能是主题词；据此把句子成分排除在主题词候选之外
function findContinuations(items) {
  const conts = new Set()
  for (const b of items) {
    for (const a of items) {
      if (a === b) continue
      if (canMerge(a, b)) { conts.add(b.id); break }
    }
  }
  return conts
}

function mergeLines(items, protectedIds = new Set()) {
  const list = items.map(t => ({ ...t, merged: [t] }))
  let changed = true
  while (changed) {
    changed = false
    outer:
    for (const a of list) {
      if (a.gone || endsClosed(a) || protectedIds.has(a.id)) continue
      for (const b of list) {
        if (b === a || b.gone || protectedIds.has(b.id)) continue
        if (!canMerge(a, b)) continue
        a.merged.push(...b.merged)
        a.text = a.merged.map(m => m.text).join(' ')
        a.confidence = Math.min(...a.merged.map(m => m.confidence))
        a.low_conf = a.merged.some(m => m.low_conf)
        const box = unionBox(a.merged)
        Object.assign(a, box)
        // x/y/w/h 已取整，right/bottom 需再次取整以免出现 0.9662599999999999
        a.points_norm = [
          [a.x, a.y],
          [r5(right(a)), a.y],
          [r5(right(a)), r5(bottom(a))],
          [a.x, r5(bottom(a))]
        ]
        b.gone = true
        changed = true
        continue outer
      }
    }
  }
  return list.filter(t => !t.gone)
}

// 中英配对：英文在上、中文在下，位置相邻
function pairBlocks(zhs, ens) {
  const cands = []
  for (const z of zhs) {
    for (const e of ens) {
      const gap = z.y - bottom(e)          // 负值表示略有重叠
      if (gap > P.pairMaxGap) continue
      if (gap < -0.5 * Math.min(z.h, e.h)) continue
      const dx = Math.abs(centerX(z) - centerX(e))
      if (overlapX(z, e) < P.pairMinOverlapX && dx > P.pairMaxDx) continue
      cands.push({ z, e, cost: Math.abs(gap) + dx })
    }
  }
  cands.sort((a, b) => a.cost - b.cost)
  const usedZ = new Set(), usedE = new Set(), pairs = []
  for (const c of cands) {
    if (usedZ.has(c.z) || usedE.has(c.e)) continue
    usedZ.add(c.z); usedE.add(c.e)
    pairs.push({ zh: c.z, en: c.e })
  }
  return {
    pairs,
    loneZh: zhs.filter(z => !usedZ.has(z)),
    loneEn: ens.filter(e => !usedE.has(e))
  }
}

// 排序：默认按整体纵向位置；useBand 时先纵向分带、同带内从左到右
function sortUnits(units) {
  const withBox = units.map(u => ({ u, b: unionBox(u.en ? [u.zh, u.en] : [u.zh]) }))
  withBox.sort((a, b) => centerY(a.b) - centerY(b.b) || centerX(a.b) - centerX(b.b))
  if (!P.useBand) return withBox.map(o => o.u)

  const bands = []
  for (const it of withBox) {
    const last = bands[bands.length - 1]
    if (last && last.some(o => Math.abs(centerY(o.b) - centerY(it.b)) < 0.5 * Math.min(o.b.h, it.b.h))) {
      last.push(it)
      continue
    }
    bands.push([it])
  }
  return bands.flatMap(band => band.sort((a, b) => centerX(a.b) - centerX(b.b)).map(o => o.u))
}

function main() {
  const src = process.argv[2]
  if (!src) {
    console.error('用法: node ocr_sort.cjs "<源文件.json>" [输出文件.json]')
    process.exit(1)
  }
  const dst = process.argv[3] || src.replace(/\.json$/i, '') + '_new.json'
  const data = JSON.parse(fs.readFileSync(src, 'utf8'))

  // 1. 最顶行：标题（中文宽块）在前，编号（非中文窄块）次之
  //    先取出，不参与正文的分行合并（否则编号会与主题词在几何上满足合并条件，干扰续行判断）
  const atTopRow = t => t.y <= P.topRowMaxY
  const head = [
    ...data.texts.filter(t => atTopRow(t) && isZh(t.text) && t.w > P.titleMinW),
    ...data.texts.filter(t => atTopRow(t) && !isZh(t.text) && t.w < P.numMaxW)
  ]
  const headIds = new Set(head.map(t => t.id))
  const body = data.texts.filter(t => !headIds.has(t.id))

  // 2. 识别主题词候选（左侧、字号大、位于顶部的英文短词，且不属于任何句子的续行）
  const mergeRel = findContinuations(body)
  const isTopicCandidate = t =>
    !isZh(t.text) &&
    bottom(t) <= P.topicMaxBottom &&
    t.h >= P.topicMinH &&
    t.x <= P.topicMaxX &&
    t.text.trim().split(/\s+/).length <= P.topicMaxWords &&
    !/[.。!！?？]$/.test(t.text.trim()) &&   // 主题词是短语，不是完整句
    !mergeRel.has(t.id)                    // 孤立出现，不参与换行合并
  //    只取最靠上的一组，避免把图片上其他孤立短块（如句子开头、标注）误认作主题词
  const cands = body.filter(isTopicCandidate)
  const minY = cands.length ? Math.min(...cands.map(t => t.y)) : 0
  const topicCand = new Set(cands.filter(t => t.y <= minY + P.topicYGroup).map(t => t.id))

  // 3. 分行合并
  const all = mergeLines(body, topicCand)

  // 4. 中英配对（不预先排除任何块，配对优先于主题词确认）
  const { pairs, loneZh, loneEn } = pairBlocks(
    all.filter(t => isZh(t.text)),
    all.filter(t => !isZh(t.text))
  )

  // 5. 主题词候选在配对后仍孤立 → 确认为主题词，置尾
  const topic = loneEn.filter(t => topicCand.has(t.id)).sort((a, b) => a.y - b.y)
  const topicIds = new Set(topic.map(t => t.id))

  // 6. 组装并按阅读顺序排列
  const units = [
    ...pairs.map(p => ({ zh: p.zh, en: p.en })),
    ...loneZh.map(t => ({ zh: t })),
    ...loneEn.filter(t => !topicIds.has(t.id)).map(t => ({ zh: t }))
  ]
  const ordered = sortUnits(units)

  const texts = [...head]
  for (const u of ordered) { texts.push(u.zh); if (u.en) texts.push(u.en) }
  texts.push(...topic)

  // 7. 校验：每个源条目都被覆盖（直接输出，或被并进某个合并块），且不重复
  const srcIds = data.texts.map(t => t.id)
  const outIds = texts.map(t => t.id)
  const dup = outIds.filter((v, i) => outIds.indexOf(v) !== i)
  if (dup.length) throw new Error('输出存在重复 id: ' + dup.join(','))
  const covered = new Set()
  for (const t of texts) (t.merged || [t]).forEach(m => covered.add(m.id))
  const missing = srcIds.filter(id => !covered.has(id))
  if (missing.length) throw new Error('输出遗漏 id: ' + missing.join(','))
  const extra = [...covered].filter(id => !srcIds.includes(id))
  if (extra.length) throw new Error('输出存在未知 id: ' + extra.join(','))

  // 8. 输出：还原源文件 0.0 / 1.0 的数值书写风格
  const out = { image: data.image, width: data.width, height: data.height, text_count: data.text_count, texts }
  const MARK = '@@NUM'
  const keep = v => (Number.isInteger(v) ? MARK + v.toFixed(1) + '@@' : v)
  const marked = {
    ...out,
    texts: out.texts.map(({ merged, ...t }) => ({
      ...t,
      confidence: keep(t.confidence),
      points_norm: t.points_norm.map(p => p.map(keep)),
      x: keep(t.x), y: keep(t.y), w: keep(t.w), h: keep(t.h)
    }))
  }
  fs.writeFileSync(dst, JSON.stringify(marked, null, 2).replace(/"@@NUM(-?\d+\.\d)@@"/g, '$1'), 'utf8')

  const isZhT = t => isZh(t.text)
  let pairOk = true
  for (const p of pairs) if (!(isZhT(p.zh) && !isZhT(p.en))) pairOk = false
  console.log('输出:', dst)
  console.log('条目:', data.texts.length, '->', texts.length,
    '| 合并', data.texts.length - all.length,
    '| 配对', pairs.length, '| 孤立', loneZh.length + loneEn.length - topic.length,
    '| 主题词', topic.length)
  console.log('中->英配对检查:', pairOk ? '通过' : '存在异常')
  console.log('顺序:', outIds.join(','))
}

main()
