#!/usr/bin/env node
// 压缩 public/audio 下的音频，缓解 GitHub Pages 播放卡顿
//
// macOS 自带 afconvert 不支持 MP3 编码，但支持 AAC，故输出 m4a。
// AAC 在同等听感下比 MP3 体积更小，且主流浏览器（含 iOS Safari）均支持。
//
// 用法:
//   node compress_audio.cjs            # 默认 96kbps 单声道（推荐：语音清晰且体积小）
//   node compress_audio.cjs 64         # 更激进：64kbps 单声道
//   node compress_audio.cjs 128        # 更保守：128kbps 单声道
//
// 说明：
//   - 输出到 public/audio/<原名>.m4a，并自动更新 index.json 的 audio 字段
//   - 转换成功后删除原 mp3（外部目录 2-见物能聊音频 仍保留原始文件）
//   - 可重复执行；已存在同名 m4a 时跳过

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const BITRATE = process.argv[2] || '96000'
const AUDIO_DIR = path.join(__dirname, 'public', 'audio')
const IDX = path.join(__dirname, 'public', 'data', 'index.json')

if (!fs.existsSync(AUDIO_DIR)) throw new Error('未找到 public/audio')
if (process.platform !== 'darwin') throw new Error('afconvert 仅存在于 macOS')

const files = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'))
if (!files.length) {
  console.log('没有待转换的 mp3（可能已全部转换完成）')
  process.exit(0)
}

const sizeBefore = files.reduce((s, f) => s + fs.statSync(path.join(AUDIO_DIR, f)).size, 0)
console.log(`待转换 ${files.length} 个文件，原始体积 ${(sizeBefore / 1024 / 1024).toFixed(1)} MB`)
console.log(`目标：AAC ${BITRATE / 1000}kbps 单声道\n`)

let done = 0, failed = []
const t0 = Date.now()

for (const f of files) {
  const src = path.join(AUDIO_DIR, f)
  const out = path.join(AUDIO_DIR, f.replace(/\.mp3$/, '.m4a'))
  if (fs.existsSync(out)) { done++; continue }
  try {
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', BITRATE, '-c', '1', src, out], {
      stdio: 'pipe'
    })
    fs.unlinkSync(src) // 转换成功，移除原 mp3
    done++
    if (done % 10 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(0)
      console.log(`  已处理 ${done}/${files.length}（${el}s）`)
    }
  } catch (e) {
    failed.push(f + ': ' + (e.stderr?.toString().trim() || e.message))
    if (fs.existsSync(out)) fs.unlinkSync(out)
  }
}

// 更新 index.json：audio 字段 .mp3 -> .m4a
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))
let changed = 0
for (const item of idx) {
  if (item.audio && item.audio.endsWith('.mp3')) {
    item.audio = item.audio.replace(/\.mp3$/, '.m4a')
    changed++
  }
}
fs.writeFileSync(IDX, JSON.stringify(idx, null, 2) + '\n', 'utf8')

const after = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.m4a'))
const sizeAfter = after.reduce((s, f) => s + fs.statSync(path.join(AUDIO_DIR, f)).size, 0)

console.log(`\n完成：转换 ${done} 个，失败 ${failed.length} 个`)
if (failed.length) failed.slice(0, 5).forEach(x => console.log('  ✗', x))
console.log(`index.json 更新 ${changed} 项`)
console.log(`体积：${(sizeBefore / 1024 / 1024).toFixed(1)} MB → ${(sizeAfter / 1024 / 1024).toFixed(1)} MB` +
  `（节省 ${Math.round((1 - sizeAfter / sizeBefore) * 100)}%）`)
console.log(`耗时：${((Date.now() - t0) / 1000).toFixed(0)}s`)
