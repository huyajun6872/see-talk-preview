import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
})
const page = await browser.newPage()
const logs = []
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`))
page.on('requestfailed', r => logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 1500))

const appHtml = await page.$eval('#app', el => el.innerHTML.length).catch(() => 'NO #app')
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300))

console.log('=== CONSOLE/ERRORS ===')
console.log(logs.join('\n') || '(none)')
console.log('=== #app innerHTML length ===', appHtml)
console.log('=== body visible text ===', JSON.stringify(bodyText))
await browser.close()
