// 開発環境にあるPlaywrightを利用。アプリ本体の依存ではありません。
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const server = http.createServer((req, res) => {
    const file = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/assets/exploration-hero.png': 'assets/exploration-hero.png', '/assets/lantern.svg': 'assets/lantern.svg', '/assets/navigator.svg': 'assets/navigator.svg' }[req.url];
    if (!file) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    // ブラウザのネットワーク制限がある環境でも、ローカルの実ファイルを検証する。
    await page.route(url + '/**', route => {
      const file = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/assets/exploration-hero.png': 'assets/exploration-hero.png', '/assets/lantern.svg': 'assets/lantern.svg', '/assets/navigator.svg': 'assets/navigator.svg' }[new URL(route.request().url()).pathname];
      return file ? route.fulfill({ path: path.join(__dirname, file), contentType: file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }) : route.fulfill({ status: 404, body: '' });
    });
    await page.goto(url);
    assert(await page.locator('#welcome').isVisible());
    await page.waitForFunction(() => document.querySelector('.hero-art').naturalWidth > 0);
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home overflow at ${width}`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('.home-menu summary').click();
    assert(await page.locator('.home-menu nav').isVisible());
    await page.locator('.home-menu summary').click();
    if (process.env.HOME_SCREENSHOT) await page.screenshot({ path: process.env.HOME_SCREENSHOT, fullPage: true });
    await page.locator('#start').click();
    await page.locator('#open-journal').click();
    assert(await page.locator('#journal-dialog').isVisible());
    await page.locator('#journal-dialog button').click();
    await page.locator('#open-settings').click();
    assert(await page.locator('#settings-dialog').isVisible());
    await page.locator('#settings-dialog form button').click();
    await page.locator('#open-help').click();
    assert(await page.locator('#help-dialog').isVisible());
    await page.locator('#help-dialog button').click();
    if (process.env.CHAT_SCREENSHOT) await page.screenshot({ path: process.env.CHAT_SCREENSHOT });
    // Safariでキーボードを閉じた後もoffsetTopだけ一時的に残る順序を再現する。
    await page.evaluate(() => {
      window.keyboardViewport = { height: 340, offsetTop: 280 };
      for (const key of ['height', 'offsetTop']) {
        Object.defineProperty(visualViewport, key, { configurable: true, get: () => window.keyboardViewport[key] });
      }
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.locator('#answer').focus();
      await page.evaluate(() => {
        window.keyboardViewport.height = 340;
        window.keyboardViewport.offsetTop = 280;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('#chat').style.height === '340px');
      assert(await page.evaluate(() => {
        const chat = document.querySelector('#chat').getBoundingClientRect();
        const input = document.querySelector('#answer-form').getBoundingClientRect();
        // パンした可視領域の上端とチャットの上端、下端と入力欄の下端が一致する。
        return chat.top === 280 && input.bottom === visualViewport.offsetTop + visualViewport.height;
      }));
      // scrollがresizeより後に来る場合も、開いている間だけ追従する。
      await page.evaluate(() => {
        window.keyboardViewport.offsetTop = 220;
        visualViewport.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(() => document.querySelector('#chat').style.top === '220px');
      // キーボードだけ閉じ、フォーカスや古いoffsetが残る順序でも補正を解除する。
      await page.evaluate(() => {
        window.keyboardViewport.height = 812;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('#chat').style.top === '0px');
      await page.evaluate(() => {
        window.keyboardViewport.height = 340;
        window.keyboardViewport.offsetTop = 280;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.querySelector('#chat').style.top === '280px');
      await page.evaluate(() => {
        document.querySelector('#answer').blur();
        window.keyboardViewport.height = 812;
        // offsetTopの更新はresizeより遅れたままにしておく。
        visualViewport.dispatchEvent(new Event('resize'));
        visualViewport.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(() => {
        const chat = document.querySelector('#chat').getBoundingClientRect();
        return chat.top === 0 && chat.height === 812 && !document.body.classList.contains('keyboard-open');
      });
      await page.locator('#open-help').click();
      assert(await page.locator('#help-dialog').isVisible());
      await page.locator('#help-dialog button').click();
    }
    await page.evaluate(() => {
      delete visualViewport.height;
      delete visualViewport.offsetTop;
      delete window.keyboardViewport;
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.locator('#answer').fill('書きかけ');
    await page.reload();
    assert.equal(await page.locator('#answer').inputValue(), '書きかけ');
    await page.locator('#answer').fill('   ');
    await page.locator('#answer-form [type=submit]').click();
    assert.equal(await page.locator('.user').count(), 0);
    const words = '<img src=x onerror=alert(1)> 大切な思い出';
    await page.locator('#answer').fill(words);
    await page.locator('#answer-form [type=submit]').click();
    await page.reload();
    assert.equal(await page.locator('.user').count(), 1);
    assert.equal(await page.locator('#step-label').textContent(), '2 / 6');
    await page.locator('#skip').click();
    await page.waitForFunction(() => !document.querySelector('#answer-form [type=submit]').disabled);
    assert.equal(await page.locator('#step-label').textContent(), '3 / 6');
    await page.locator('#answer').fill('長い回答の景色。\n'.repeat(60));
    await page.locator('#answer-form [type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#answer-form [type=submit]').disabled);
    assert.equal(await page.locator('#step-label').textContent(), '4 / 6');
    assert.equal(await page.locator('.user').count(), 3);
    assert(await page.locator('.guide').count() > 0);
    await page.setViewportSize({ width: 375, height: 460 });
    await page.waitForFunction(() => document.querySelector('#chat').getBoundingClientRect().height <= innerHeight);
    await page.locator('#answer').focus();
    await page.locator('#answer').fill('キーボードを閉じても書きかけを保持');
    assert(await page.evaluate(() => document.querySelector('#answer-form').getBoundingClientRect().height < 110));
    await page.setViewportSize({ width: 375, height: 360 });
    await page.waitForFunction(() => document.querySelector('#chat').getBoundingClientRect().height <= 360);
    assert(await page.evaluate(() => document.querySelector('#messages').clientHeight > 200));
    await page.locator('#skip').hover();
    const stepBeforeScroll = await page.locator('#step-label').textContent();
    await page.mouse.wheel(0, -250);
    await page.waitForFunction(() => document.querySelector('#messages').scrollTop < document.querySelector('#messages').scrollHeight - document.querySelector('#messages').clientHeight - 50);
    assert.equal(await page.locator('#step-label').textContent(), stepBeforeScroll);
    assert(await page.evaluate(() => window.scrollY === 0));
    assert.deepEqual(await page.evaluate(() => {
      function drag(target, delta) {
        const start = new Event('touchstart', { bubbles: true });
        Object.defineProperty(start, 'touches', { value: [{ clientY: 150 }] });
        target.dispatchEvent(start);
        const move = new Event('touchmove', { bubbles: true, cancelable: true });
        Object.defineProperty(move, 'touches', { value: [{ clientY: 150 + delta }] });
        target.dispatchEvent(move);
        return move.defaultPrevented;
      }
      const messages = document.querySelector('#messages');
      const saved = messages.scrollTop;
      messages.scrollTop = 0;
      const topBlocked = drag(messages, 30);
      const inwardAllowed = !drag(messages, -30);
      messages.scrollTop = messages.scrollHeight;
      const bottomBlocked = drag(document.querySelector('#skip'), -30);
      const headerBlocked = drag(document.querySelector('.section-heading'), 30);
      const composerBlocked = drag(document.querySelector('#answer-form'), -30);
      messages.scrollTop = saved;
      return [topBlocked, inwardAllowed, bottomBlocked, headerBlocked, composerBlocked];
    }), [true, true, true, true, true]);
    await page.locator('#messages').click({ position: { x: 8, y: 8 } });
    assert(await page.evaluate(() => document.activeElement !== document.querySelector('#answer')));
    assert.equal(await page.locator('#answer').inputValue(), 'キーボードを閉じても書きかけを保持');
    assert(await page.evaluate(() => {
      const messages = document.querySelector('#messages');
      const form = document.querySelector('#answer-form').getBoundingClientRect();
      return messages.scrollTop > 0 && messages.getBoundingClientRect().bottom <= form.top + 1 && form.bottom <= innerHeight + 1;
    }));
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `exploration overflow at ${width}`);
    }
    for (const answer of ['落ち着く場所', '未来の時間', '小さな一歩']) {
      await page.locator('#answer').fill(answer);
      await page.locator('#answer-form [type=submit]').click();
    }
    await page.locator('#result').waitFor({ state: 'visible' });
    assert(await page.locator('#arrival').isVisible());
    assert.equal(await page.locator('#answer').isDisabled(), false);
    await page.locator('.map-link').click();
    await page.waitForFunction(() => document.querySelector('#result').getBoundingClientRect().top < 100);
    assert.equal(await page.locator('.scene-card').count(), 6);
    assert.equal(await page.locator('.scene-fragment').count(), 5);
    await page.locator('.scene-card summary').first().click();
    assert.equal(await page.locator('.words').first().textContent(), words);
    assert.equal(await page.locator('#cards img').count(), 0);
    await page.reload();
    await page.locator('#result').waitFor({ state: 'visible' });
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    }
    await page.locator('#delete').click();
    await page.locator('#cancel-delete').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    await page.evaluate(() => localStorage.setItem('unrelated', 'keep'));
    await page.locator('#delete').click();
    await page.locator('#confirm-delete').click();
    assert(await page.locator('#welcome').isVisible());
    assert.equal(await page.evaluate(() => localStorage.getItem('jibun-tanken-v1')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated')), 'keep');
    await page.reload();
    assert(await page.locator('#welcome').isVisible());
    await page.evaluate(() => localStorage.setItem('jibun-tanken-v1', '{broken'));
    await page.reload();
    assert(await page.locator('#storage-notice').isVisible());
    await page.locator('#delete').click();
    await page.locator('#confirm-delete').click();
    await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Unavailable'); }; });
    await page.reload();
    await page.locator('#start').click();
    assert(await page.locator('#storage-notice').isVisible());
    assert(await page.locator('#chat').isVisible());
    assert.deepEqual(errors, []);
    console.log('PASS: welcome, draft/resume, blank validation, skip, 6 answers, literal output, cards/resume, responsive widths, deletion/cancel/isolation, corrupt record, storage failure, no JS errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
