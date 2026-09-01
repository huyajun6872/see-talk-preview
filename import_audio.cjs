// 将外部音频目录的 mp3 复制到项目 public/audio，并在 index.json 中登记 audio 字段
// 文件名与卡片名（去掉 .json）一一对应；带 _20240408_ 时间戳的重复副本跳过
const fs = require('fs')
const path = require('path')

const AUDIO_SRC = '/Users/admin/Documents/见物能聊100-图片-可自行打印/2-见物能聊音频'
const PUB = '/Users/admin/Documents/见物能聊100-图片-可自行打印/处理/see-talk-preview/public'
const OUT = path.join(PUB, 'audio')
const IDX = path.join(PUB, 'data', 'index.json')

fs.mkdirSync(OUT, { recursive: true })

// 源音频：跳过重复副本
const srcFiles = fs.readdirSync(AUDIO_SRC).filter(f => f.endsWith('.mp3') && !/_\d{8}_\d{6}\.mp3$/.test(f))

const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))
const byStem = new Map(srcFiles.map(f => [f.replace(/\.mp3$/, ''), f]))

let copied = 0
const skipped = []
for (const item of idx) {
  const stem = item.file.replace(/\.json$/, '')
  const src = byStem.get(stem)
  if (!src) { skipped.push(stem); continue }
  fs.copyFileSync(path.join(AUDIO_SRC, src), path.join(OUT, src))
  item.audio = 'audio/' + src
  copied++
}

// 清理目标目录中的多余文件（如旧版本残留）
const wanted = new Set(idx.map(i => i.audio).filter(Boolean).map(a => path.basename(a)))
for (const f of fs.readdirSync(OUT)) {
  if (!wanted.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log('清理多余文件:', f) }
}

fs.writeFileSync(IDX, JSON.stringify(idx, null, 2) + '\n', 'utf8')

console.log('复制音频:', copied, '| 未匹配:', skipped.length ? skipped : '无 ✓')
console.log('源目录文件:', srcFiles.length, '| 目标目录:', fs.readdirSync(OUT).length)
const total = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0)
console.log('音频总体积:', (total / 1024 / 1024).toFixed(1), 'MB')
