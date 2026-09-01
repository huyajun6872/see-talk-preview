import puppeteer from 'puppeteer-core'

const URL = process.argv[2] || 'http://127.0.0.1:5175/'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errors = []
page.on('pageerror', e => errors.push('[PAGEERROR] ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })

// 统计音频相关的网络请求
const audioReqs = []
page.on('request', r => {
  const u = r.url()
  if (u.includes('/audio/')) audioReqs.push(decodeURIComponent(u.split('/audio/')[1]))
})

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 })
await new Promise(r => setTimeout(r, 3000))

// 读取内部 audio 元素的 preload 与缓冲状态
const probe = () => page.evaluate(() => {
  const list = performance.getEntriesByType('resource')
    .filter(e => e.name.includes('/audio/'))
    .map(e => ({ n: decodeURIComponent(e.name.split('/audio/')[1]), size: e.transferSize }))
  return list
})

console.log('=== 1. 首屏加载后，已请求的音频 ===')
const first = await probe()
console.log(first.length ? first.map(x => `  ${x.n} (${(x.size / 1024).toFixed(0)}KB)`).join('\n') : '  (未请求)')

console.log('\n=== 2. 当前卡片是否自动缓冲（preload=auto）===')
await page.click('.audiobar .play')
await new Promise(r => setTimeout(r, 2500))
const playing = await page.evaluate(() => {
  const a = document.querySelector('audio')
  if (!a) return null
  return {
    preload: a.preload,
    paused: a.paused,
    t: +a.currentTime.toFixed(2),
    dur: +(a.duration || 0).toFixed(2),
    buffered: a.buffered.length ? +a.buffered.end(a.buffered.length - 1).toFixed(2) : 0
  }
})
console.log(' ', JSON.stringify(playing))

console.log('\n=== 3. 缓冲区间显示 ===')
const bar = await page.evaluate(() => {
  const b = document.querySelector('.buffered')
  const txt = document.querySelector('.audiobar .hint, .audiobar .ok, .audiobar .time')
  return { bufferedWidth: b ? b.style.width : null, status: txt ? txt.textContent.trim() : '' }
})
console.log(' ', JSON.stringify(bar))

console.log('\n=== 4. 切换卡片后是否预取相邻项 ===')
await page.select('.picker select', '12 shoe 鞋子.json')
await new Promise(r => setTimeout(r, 3500))
const afterSwitch = await probe()
console.log('  已请求的音频:')
console.log(afterSwitch.map(x => `    ${x.n} (${(x.size / 1024).toFixed(0)}KB)`).join('\n') || '    (无)')

console.log('\n=== 错误 ===', errors.length ? errors.join('\n') : '(无)')
await browser.close()
