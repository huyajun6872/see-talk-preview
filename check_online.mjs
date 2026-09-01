import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
})
const page = await browser.newPage()
const logs = []
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`))
page.on('requestfailed', r => logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`))

await page.goto('https://huyajun6872.github.io/see-talk-preview/', { waitUntil: 'networkidle0', timeout: 20000 })
await new Promise(r => setTimeout(r, 1500))

const loadingVisible = await page.evaluate(() => {
  const el = document.querySelector('.loading')
  return el ? el.offsetParent !== null : false
})
const imgInfo = await page.evaluate(() => {
  const img = document.querySelector('.bg')
  return img ? { src: img.currentSrc, naturalW: img.naturalWidth } : 'NO IMG'
})
const textCount = await page.evaluate(() => document.querySelectorAll('.item').length)

console.log('=== pageerrors ===', logs.join('\n') || '(none)')
console.log('=== .loading still visible? ===', loadingVisible)
console.log('=== bg image ===', JSON.stringify(imgInfo))
console.log('=== text items rendered ===', textCount)
await browser.close()
