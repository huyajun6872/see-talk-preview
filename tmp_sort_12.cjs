// 临时脚本：按语义 + 坐标位置，将 12 shoe 鞋子.json 的中英文合并排序（中文在前、英文在后）
const fs = require('fs')
const path = require('path')

const dir = '/Users/admin/Documents/见物能聊100-图片-可自行打印/处理/data'
const src = path.join(dir, '12 shoe 鞋子.json')
const dst = path.join(dir, '12 shoe 鞋子_new.json')

const raw = fs.readFileSync(src, 'utf8')
const data = JSON.parse(raw)
const byId = new Map(data.texts.map(t => [t.id, t]))

// 输出顺序规范：每项为一个输出条目，括号内为合并到一条的源 id
// 规则：标题 + 编号置顶；位置相邻的中英配对「中文在前、英文在后」按位置排序；主题词置尾
const spec = [
  [2],       // 穿鞋时可以教的英语（标题）
  [1],       // 12（编号）
  [6], [4, 5],   // 你鞋子穿反了 / You put your shoes on the wrong feet
  [8], [7],      // 把它们换过来(穿反了交换一下) / Switch them around
  [10], [9],     // 错误的 / Wrong
  [12], [11],    // 交换 / Switch
  [15], [13],    // 把鞋舌头拉出来 / Pull out the tongue
  [16], [14],    // 这双鞋合脚吗 / Do the shoes fit?
  [18], [17],    // 合适 / Fit
  [20], [19],    // 舌头 / tongue
  [22], [21],    // 踩 / Step
  [24], [23],    // 滑入 / Slip
  [27], [25],    // 别踩脚后跟 / Don't step on the back
  [28], [26],    // 穿上拖鞋 / Slip into the slippers
  [30], [29],    // 鞋柜 / Shoe cabinet
  [32], [31],    // 匹配 / Match
  [33],          // 三（孤立块，按位置插入）
  [38], [34, 36],// 这双鞋和你的裤子不搭 / This pair of shoes doesn't match your pants.
  [37], [35],    // 从鞋柜把鞋子拿出来 / Take the shoes out of the shoe cabinet
  [3]        // Shoe（主题词，置尾）
]

const r5 = n => Math.round(n * 1e5) / 1e5

const texts = spec.map(ids => {
  const items = ids.map(id => {
    const t = byId.get(id)
    if (!t) throw new Error('缺少 id: ' + id)
    return t
  })
  if (items.length === 1) return { ...items[0] }

  // 多行合并：文本空格拼接，取外包矩形，置信度取最小值
  const minX = Math.min(...items.map(t => t.x))
  const maxX = Math.max(...items.map(t => t.x + t.w))
  const minY = Math.min(...items.map(t => t.y))
  const maxY = Math.max(...items.map(t => t.y + t.h))
  return {
    id: items[0].id,
    text: items.map(t => t.text).join(' '),
    confidence: Math.min(...items.map(t => t.confidence)),
    low_conf: items.some(t => t.low_conf),
    points_norm: [
      [r5(minX), r5(minY)],
      [r5(maxX), r5(minY)],
      [r5(maxX), r5(maxY)],
      [r5(minX), r5(maxY)]
    ],
    x: r5(minX),
    y: r5(minY),
    w: r5(maxX - minX),
    h: r5(maxY - minY)
  }
})

// 校验：所有源条目必须被用到且仅用一次
const used = spec.flat()
const dup = used.filter((v, i) => used.indexOf(v) !== i)
const missing = data.texts.map(t => t.id).filter(id => !used.includes(id))
const unknown = used.filter(id => !byId.has(id))
if (dup.length) throw new Error('重复使用的 id: ' + dup)
if (missing.length) throw new Error('未使用的 id: ' + missing)
if (unknown.length) throw new Error('不存在的 id: ' + unknown)

const out = {
  image: data.image,
  width: data.width,
  height: data.height,
  text_count: data.text_count, // 与先例一致，保持原值
  texts
}

// 源文件将整值浮点写作 0.0 / 1.0，JSON.stringify 会输出 0 / 1，此处用占位符还原书写风格
const MARK = '@@NUM'
const preserve = v => (Number.isInteger(v) ? MARK + v.toFixed(1) + '@@' : v)
const marked = {
  ...out,
  texts: out.texts.map(t => ({
    ...t,
    confidence: preserve(t.confidence),
    points_norm: t.points_norm.map(p => p.map(preserve)),
    x: preserve(t.x),
    y: preserve(t.y),
    w: preserve(t.w),
    h: preserve(t.h)
  }))
}
const json = JSON.stringify(marked, null, 2).replace(/"@@NUM(-?\d+\.\d)@@"/g, '$1')

fs.writeFileSync(dst, json + (raw.endsWith('\n') ? '\n' : ''), 'utf8')

console.log('源文件条目:', data.texts.length, '-> 输出条目:', texts.length)
console.log('顺序:', texts.map(t => t.id).join(','))
console.log('已生成:', dst)
