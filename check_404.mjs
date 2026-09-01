import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
})
const page = await browser.newPage()
const failed = []
page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
page.on('requestfailed', r => failed.push(`FAIL ${r.url()} ${r.failure()?.errorText}`))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 1500))

console.log('=== FAILED/404 REQUESTS ===')
console.log(failed.join('\n') || '(none)')

// 检查图片是否真正渲染
const imgInfo = await page.evaluate(() => {
  const img = document.querySelector('.bg')
  if (!img) return 'NO .bg img'
  return { src: img.currentSrc || img.src, complete: img.complete, naturalW: img.naturalWidth, naturalH: img.naturalHeight }
})
console.log('=== bg image ===', JSON.stringify(imgInfo))
await browser.close()
