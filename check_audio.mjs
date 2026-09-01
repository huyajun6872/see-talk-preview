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

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 })
await new Promise(r => setTimeout(r, 1800))

console.log('1. AudioBar 渲染:', (await page.$('.audiobar')) ? '✓' : '✗')
console.log('2. 音频名:', JSON.stringify(await page.$eval('.audiobar .name', el => el.textContent.trim()).catch(() => '')))

await page.click('.audiobar .play')
await new Promise(r => setTimeout(r, 2200))
const st = await page.evaluate(() => {
  const a = document.querySelector('audio')
  return a ? { paused: a.paused, t: +a.currentTime.toFixed(2), dur: +(a.duration || 0).toFixed(2) } : null
})
console.log('3. 播放中:', JSON.stringify(st), st && !st.paused && st.t > 0 ? '✓' : '✗')
console.log('4. 时间显示:', JSON.stringify(await page.$eval('.audiobar .time', el => el.textContent.trim()).catch(() => '')))

await page.screenshot({ path: 'audio_check.png' })
console.log('5. 截图已保存 audio_check.png')
console.log('=== 错误 ===', errors.length ? errors.join('\n') : '(无)')

await browser.close()
