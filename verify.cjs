const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
  try {
    const page = await browser.newPage({viewport:{width:375,height:812}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const root='http://jibun.test';
    const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/assets/figma-favicon.svg':'assets/figma-favicon.svg','/assets/fonts/klee-one-jp.ttf':'assets/fonts/klee-one-jp.ttf'};
    await page.route(root+'/**', route=>{
      const file=files[new URL(route.request().url()).pathname];
      return file ? route.fulfill({path:path.join(__dirname,file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.ttf')?'font/ttf':'text/html; charset=utf-8'}) : route.fulfill({status:404,body:''});
    });
    await page.goto(root);
    await page.evaluate(()=>document.fonts.ready);
    assert(await page.locator('#welcome').isVisible());
    assert.equal(await page.locator('.doodle-hero').count(),1);
    for(const width of [320,375,768,1280]){
      await page.setViewportSize({width,height:812});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`home overflow ${width}`);
      if(width===1280){
        assert(await page.locator('.flyer-header>p').evaluate(el=>el.getBoundingClientRect().height<40));
        if(process.env.DESKTOP_SCREENSHOT) await page.screenshot({path:process.env.DESKTOP_SCREENSHOT,fullPage:true});
      }
    }
    await page.setViewportSize({width:375,height:812});
    if(process.env.HOME_SCREENSHOT) await page.screenshot({path:process.env.HOME_SCREENSHOT,fullPage:true});
    await page.locator('#start').click();
    await page.locator('#answer').fill('書きかけの言葉');
    await page.reload();
    assert.equal(await page.locator('#answer').inputValue(),'書きかけの言葉');
    await page.locator('#answer').fill('   ');
    assert(await page.locator('#send').isDisabled());
    const words='<img src=x onerror=alert(1)> 大切な思い出';
    await page.locator('#answer').fill(words);
    await page.locator('#answer').press('Enter');
    assert.equal(await page.locator('.message--user').count(),0);
    await page.locator('#answer').fill(words);
    await page.locator('#send').click();
    await page.locator('[data-home]').last().click();
    await page.locator('#start').click();
    await page.reload();
    assert.equal(await page.locator('#step-label').textContent(),'2 / 6');
    assert.equal(await page.locator('.message--user').count(),1);
    await page.locator('#skip').click();
    await page.waitForFunction(()=>!document.querySelector('#skip').disabled);
    assert.equal(await page.locator('#step-label').textContent(),'3 / 6');
    await page.locator('#answer').fill('長い言葉の景色。\n'.repeat(70));
    await page.locator('#send').click();
    await page.waitForFunction(()=>!document.querySelector('#skip').disabled);
    await page.locator('#answer').fill('入力途中');
    await page.locator('[data-home]').last().click();
    assert(await page.locator('#welcome').isVisible());
    assert((await page.locator('#start').textContent()).includes('続きを'));
    await page.locator('#start').click();
    assert.equal(await page.locator('#answer').inputValue(),'入力途中');
    await page.locator('#answer').blur();
    if(process.env.CHAT_SCREENSHOT) await page.screenshot({path:process.env.CHAT_SCREENSHOT});
    for(const width of [320,375,768,1280]){
      await page.setViewportSize({width,height:812});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`chat overflow ${width}`);
    }
    await page.setViewportSize({width:375,height:812});
    await page.evaluate(()=>{
      window.keyboardViewport={height:340,offsetTop:280};
      for(const key of ['height','offsetTop']) Object.defineProperty(visualViewport,key,{configurable:true,get:()=>window.keyboardViewport[key]});
    });
    for(let i=0;i<3;i++){
      await page.locator('#answer').focus();
      await page.evaluate(()=>{window.keyboardViewport.height=340;window.keyboardViewport.offsetTop=280;visualViewport.dispatchEvent(new Event('resize'));});
      await page.waitForFunction(()=>document.querySelector('#chat').style.top==='280px');
      assert(await page.evaluate(()=>document.querySelector('#answer-form').getBoundingClientRect().bottom<=620));
      await page.evaluate(()=>{document.querySelector('#answer').blur();window.keyboardViewport.height=812;visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));});
      await page.waitForFunction(()=>document.querySelector('#chat').style.top==='0px'&&document.querySelector('#chat').style.height==='812px');
    }
    await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;delete window.keyboardViewport;visualViewport.dispatchEvent(new Event('resize'));});
    for(const answer of ['自分の時間','いつかの風景','小さな一歩']){
      await page.locator('#answer').fill(answer); await page.locator('#send').click();
      await page.waitForFunction(()=>!document.querySelector('#skip').disabled);
    }
    await page.locator('#show-summary').click();
    assert.equal(await page.locator('.scene-item').count(),3);
    assert.equal(await page.locator('.words').first().textContent(),words);
    assert.equal(await page.locator('#cards img').count(),0);
    assert.equal(await page.locator('.collection-fragment').count(),5);
    assert(!(await page.locator('#result').textContent()).includes('という流れがありそう'));
    await page.reload(); assert(await page.locator('#result').isVisible());
    for(const width of [320,375,768,1280]){
      await page.setViewportSize({width,height:812});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`result overflow ${width}`);
    }
    await page.setViewportSize({width:375,height:812});
    if(process.env.RESULT_SCREENSHOT){
      await page.waitForFunction(()=>[...document.querySelectorAll('.collection-fragment')].every(el=>getComputedStyle(el).opacity==='1'));
      await page.screenshot({path:process.env.RESULT_SCREENSHOT});
    }
    await page.locator('#back-chat').click();assert(await page.locator('#summary-cta').isVisible());
    await page.locator('#show-summary').click();
    await page.locator('#result [data-delete]').click();await page.locator('#cancel-delete').click();
    assert(await page.locator('#result').isVisible());
    await page.evaluate(()=>localStorage.setItem('unrelated','keep'));
    await page.locator('#result [data-delete]').click();await page.locator('#confirm-delete').click();
    assert(await page.locator('#welcome').isVisible());
    assert.equal(await page.evaluate(()=>localStorage.getItem('jibun-tanken-v1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated')),'keep');
    await page.evaluate(()=>localStorage.setItem('jibun-tanken-v1','{broken'));
    await page.reload();assert(await page.locator('#storage-notice').isVisible());
    await page.locator('#home-record').click();await page.locator('#confirm-delete').click();
    await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('blocked');};});
    await page.reload();await page.locator('#start').click();assert(await page.locator('#storage-notice').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS: Figma home/art/font, 4 responsive widths, draft/resume, IME-safe Enter, skip, pause/resume, keyboard open/close, 3 result cards, literal user words, no invented interpretation, delete/cancel/isolation, corrupt storage, unavailable storage');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
