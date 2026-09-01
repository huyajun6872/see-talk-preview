// 将 data/ 下 11-100 的整理结果写入项目 public/data，并重建 index.json
// 规则：11-100 使用 *_new.json 的内容，但输出文件名去掉 _new 后缀（与现有 01-10 命名一致）
const fs = require('fs')
const path = require('path')

const DATA = '/Users/admin/Documents/见物能聊100-图片-可自行打印/处理/data'
const PUB = '/Users/admin/Documents/见物能聊100-图片-可自行打印/处理/see-talk-preview/public/data'
const IMAGES = '/Users/admin/Documents/见物能聊100-图片-可自行打印/处理/see-talk-preview/public/images'

// 22 号是同一张图的两个副本（内容完全一致），只保留主文件名，避免列表出现重复项
const EXCLUDE = ['22 Window 窗子_20240408_150348.json']

const numOf = f => {
  const m = f.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : Infinity
}

// 1. 收集 11-100 的目标文件（源文件 -> 输出名）
const items = []
for (const f of fs.readdirSync(DATA).filter(f => f.endsWith('_new.json'))) {
  const num = numOf(f)
  if (num < 11 || num > 100) continue
  const outName = f.replace(/_new\.json$/, '.json')
  if (EXCLUDE.includes(outName)) continue
  items.push({ num, src: f, out: outName })
}
items.sort((a, b) => a.num - b.num)

// 2. 复制并校验
const missingImg = []
const written = []
for (const it of items) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, it.src), 'utf8'))
  if (!d.image || !d.texts) throw new Error('数据异常: ' + it.src)
  if (!fs.existsSync(path.join(IMAGES, d.image))) missingImg.push(d.image)
  fs.writeFileSync(path.join(PUB, it.out), JSON.stringify(d, null, 2) + '\n', 'utf8')
  written.push({ file: it.out, image: d.image, title: it.out.replace(/\.json$/, ''), blocks: d.text_count })
}

// 3. 重建 index.json：保留现有 01-10，追加 11-100，整体按数字序号排序
const oldIdx = JSON.parse(fs.readFileSync(path.join(PUB, 'index.json'), 'utf8'))
const keep = oldIdx.filter(x => { const n = numOf(x.file); return n < 11 || n > 100 })
const all = [...keep, ...written].sort((a, b) => numOf(a.file) - numOf(b.file))
fs.writeFileSync(path.join(PUB, 'index.json'), JSON.stringify(all, null, 2) + '\n', 'utf8')

console.log('写入文件:', written.length, '(11-100，已排除 22 的时间戳副本)')
console.log('index.json 条目:', all.length, '(保留 01-10:', keep.length, '+ 新增:', written.length, ')')
console.log('缺失图片:', missingImg.length ? missingImg : '无 ✓')
