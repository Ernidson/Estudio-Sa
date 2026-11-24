// Build first. Optionally set CHROMIUM_PATH to a Chromium executable.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox','--single-process','--no-zygote','--disable-gpu'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.route('http://rigby.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      return route.fulfill({ path:path.join('dist', pathname === '/' ? 'index.html' : pathname) });
    });
    await page.goto('http://rigby.test');
    const data = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width=200; c.height=320;
      const ctx=c.getContext('2d'); ctx.fillRect(55,20,90,280);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#file-import-png').setInputFiles({
      name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
    await page.waitForFunction(()=>window.app?.selectionManager.getSelectedObject()?.imageElement);
    await page.click('#btn-prepare-character');
    await page.click('#btn-piece-map');
    for(const [width,height] of [[1366,768],[1680,930],[1920,1080]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const canvas=page.locator('#main-canvas'), before=await canvas.boundingBox();
      await page.locator('.region-list-item').nth(2).click({position:{x:12,y:12}});
      assert.deepEqual(await canvas.boundingBox(),before);
      assert(await page.locator('#btn-generate-piece').isEnabled());
      assert(await page.evaluate(()=>{
        const btn=document.querySelector('#btn-generate-piece'), r=btn.getBoundingClientRect();
        return btn.contains(document.elementFromPoint(r.x+4,r.y+4)) && document.documentElement.scrollHeight<=innerHeight;
      }));
    }
    assert.deepEqual(errors,[]);
    console.log('Layout validado nas três resoluções.');
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
