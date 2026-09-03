#!/usr/bin/env node
// 将 data/ 下的 *_new.json 替换到项目 public/data，并同步 index.json 的 blocks
//
// 用法:
//   node replace_new.cjs 99              # 替换第 99 张
//   node replace_new.cjs 91-98           # 替换 91 到 98
//   node replace_new.cjs 91 95 99        # 替换指定的几张
//   node replace_new.cjs --dry 91-98     # 只校验并预览差异，不写入
//
// 说明：
//   - 替换前会校验结构（字段/坐标范围/points_norm/无重复 id/image 匹配），任一不通过即中止
//   - blocks 按约定同步为 text_count
//   - 同时核对音频与图片文件是否存在

const fs = require('fs')
const path = require('path')

const ROOT = '/Users/admin/Documents/见物能聊100-图片-可自行打印/处理'
const DATA = path.join(ROOT, 'data')
const PUB = path.join(ROOT, 'see-talk-preview', 'public', 'data')
const IDX = path.join(PUB, 'index.json')

const REQUIRED = ['image', 'width', 'height', 'text_count', 'texts']
const ITEM_FIELDS = ['id', 'text', 'confidence', 'low_conf', 'points_norm', 'x', 'y', 'w', 'h']

// ---------- 解析参数 ----------
const argv = process.argv.slice(2)
const dry = argv.includes('--dry')
const args = argv.filter(a => a !== '--dry')

if (!args.length) {
  console.error('用法: node replace_new.cjs <序号|范围|多个序号> [--dry]')
  console.error('例:   node replace_new.cjs 99')
  console.error('      node replace_new.cjs 91-98')
  console.error('      node replace_new.cjs 91 95 99 --dry')
  process.exit(1)
}

const nums = new Set()
for (const a of args) {
  const range = a.match(/^(\d+)-(\d+)$/)
  if (range) {
    const lo = parseInt(range[1], 10), hi = parseInt(range[2], 10)
    if (lo > hi) { console.error('范围无效:', a); process.exit(1) }
    for (let i = lo; i <= hi; i++) nums.add(i)
  } else if (/^\d+$/.test(a)) {
    nums.add(parseInt(a, 10))
  } else {
    console.error('参数无效:', a); process.exit(1)
  }
}

// ---------- 1. 定位并校验 ----------
const errors = []
const plans = []
for (const n of [...nums].sort((a, b) => a - b)) {
  const file = fs.readdirSync(DATA).find(x => new RegExp('^' + n + ' ').test(x) && !x.endsWith('_new.json'))
  if (!file) { errors.push(n + ': 未找到源文件'); continue }

  const srcPath = path.join(DATA, file.replace(/\.json$/, '_new.json'))
  if (!fs.existsSync(srcPath)) { errors.push(file + ': 未找到 _new.json'); continue }

  let d
  try {
    d = JSON.parse(fs.readFileSync(srcPath, 'utf8'))
  } catch (e) {
    errors.push(file + ': JSON 解析失败 ' + e.message); continue
  }

  const tag = m => errors.push(file + ': ' + m)
  for (const k of REQUIRED) if (!(k in d)) tag('缺少字段 ' + k)
  if (!Array.isArray(d.texts) || !d.texts.length) tag('texts 为空')
  if (d.image !== file.replace(/\.json$/, '.png')) tag('image 字段不符: ' + d.image)

  const ids = d.texts.map(t => t.id)
  if (new Set(ids).size !== ids.length) tag('存在重复 id')
  d.texts.forEach((t, i) => {
    for (const k of ITEM_FIELDS) if (!(k in t)) tag('条目[' + i + '] 缺少字段 ' + k)
    if (!Array.isArray(t.points_norm) || t.points_norm.length !== 4) tag('条目 id=' + t.id + ' points_norm 异常')
    for (const k of ['x', 'y', 'w', 'h']) {
      if (typeof t[k] !== 'number') tag('条目 id=' + t.id + ' ' + k + ' 非数值')
      else if (t[k] < 0 || t[k] > 1.001) tag('条目 id=' + t.id + ' ' + k + ' 越界: ' + t[k])
    }
    if (typeof t.text !== 'string' || !t.text.trim()) tag('条目 id=' + t.id + ' 文本为空')
  })

  plans.push({ n, file, srcPath, data: d })
}

if (errors.length) {
  console.log('校验未通过，已中止：')
  errors.forEach(e => console.log('  ✗', e))
  process.exit(1)
}
console.log('校验通过：' + plans.length + ' 个文件结构完整（字段/坐标/points_norm/无重复 id）\n')

// ---------- 2. 预览 / 写入 ----------
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))
const rows = []
for (const p of plans) {
  const dst = path.join(PUB, p.file)
  let oldLen = '-', oldBlocks = '-'
  if (fs.existsSync(dst)) {
    const old = JSON.parse(fs.readFileSync(dst, 'utf8'))
    oldLen = old.texts.length
    const it = idx.find(x => x.file === p.file)
    oldBlocks = it ? it.blocks : '-'
  } else {
    errors.push(p.file + ': 项目中不存在目标文件')
    continue
  }

  rows.push({
    name: p.file.replace('.json', ''),
    texts: oldLen + ' -> ' + p.data.texts.length,
    blocks: oldBlocks + ' -> ' + p.data.text_count
  })

  if (!dry) {
    fs.writeFileSync(dst, JSON.stringify(p.data, null, 2) + '\n', 'utf8')
    const it = idx.find(x => x.file === p.file)
    if (it) it.blocks = p.data.text_count
  }
}

console.log(dry ? '=== 预览（未写入）===' : '=== 已替换 ===')
rows.forEach(r => console.log('  ' + r.name.padEnd(24) + ' texts ' + r.texts.padEnd(10) + ' blocks ' + r.blocks))

if (dry) {
  console.log('\n--dry 模式，未做任何修改')
  process.exit(0)
}

fs.writeFileSync(IDX, JSON.stringify(idx, null, 2) + '\n', 'utf8')

// ---------- 3. 复核 ----------
console.log('\n=== 复核 ===')
const idx2 = JSON.parse(fs.readFileSync(IDX, 'utf8'))
const bad = []
for (const p of plans) {
  const dst = path.join(PUB, p.file)
  const now = JSON.parse(fs.readFileSync(dst, 'utf8'))
  if (JSON.stringify(now) !== JSON.stringify(p.data)) bad.push(p.file + ': 内容不一致')
  const it = idx2.find(x => x.file === p.file)
  if (it.blocks !== p.data.text_count) bad.push(p.file + ': blocks 未同步')
  if (!fs.existsSync(path.join(PUB, '..', it.audio))) bad.push(p.file + ': 音频缺失 ' + it.audio)
  if (!fs.existsSync(path.join(PUB, '..', 'images', it.image))) bad.push(p.file + ': 图片缺失 ' + it.image)
}
console.log('  index 条目数:', idx2.length,
  '| 序号无重复:', new Set(idx2.map(x => x.file)).size === idx2.length ? '✓' : '✗')
console.log('  问题:', bad.length ? bad : '无 ✓')
