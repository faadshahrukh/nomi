const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
  // 1. narrow viewport (equivalent to 200% zoom on a phone): nothing forces sideways scrolling
  {
    const page = await b.newPage({ viewport: { width: 200, height: 500 } });
    await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const over = async () => page.evaluate(() => { const e = document.scrollingElement; const wide = [...document.querySelectorAll('body *')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(x).position !== 'fixed' && !x.closest('[style*="overflow"]'); }).length; return { sw: e.scrollWidth, cw: e.clientWidth, wide }; });
    for (const tab of ['Home', 'Transactions', 'Insights', 'Planning', 'Profile']) { await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(500); const o = await over(); ok(`${tab} fits at 200% zoom (no sideways scroll)`, o.sw <= o.cw + 1); }
    await page.close();
  }
  // 2. offline: the app keeps working and says so
  {
    const ctx = await b.newContext({ viewport: { width: 400, height: 1000 } });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    const vis = async (t) => { for (const l of await page.getByText(t, { exact: false }).all()) if (await l.isVisible().catch(() => false)) return true; return false; };
    await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await ctx.setOffline(true); await page.waitForTimeout(800);
    ok('offline banner appears', await vis("You're offline"));
    const box = page.getByLabel('Describe what happened with your money');
    await box.fill('Spent 450 on lunch'); await box.press('Enter'); await page.waitForTimeout(700);
    ok('capture works offline (understood on this device)', await vis('Understood on this device'));
    await page.getByRole('button', { name: /^Save ৳450/ }).click(); await page.waitForTimeout(700);
    ok('saving works offline', await vis('Safe to Spend is now'));
    await page.getByRole('tab', { name: 'Profile' }).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Backup and sync/ }).click(); await page.waitForTimeout(500);
    ok('sync screen does not claim anything it cannot do offline', !(await vis('Backed up')) || await vis('example data'));
    await ctx.setOffline(false); await page.waitForTimeout(800);
    ok('banner clears when back online', !(await vis("You're offline")));
    ok('no page errors', errs.length === 0); if (errs.length) console.log(errs);
    await ctx.close();
  }
  // 3. keyboard only: reach the capture box, send, review and save without a pointer
  {
    const page = await b.newPage({ viewport: { width: 400, height: 1000 } });
    await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName);
    let reached = false;
    for (let i = 0; i < 25 && !reached; i++) { await page.keyboard.press('Tab'); reached = (await focusedLabel()) === 'Describe what happened with your money'; }
    ok('the capture box is reachable with Tab', reached);
    await page.keyboard.type('Spent 450 on lunch'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    let saveFocused = false;
    for (let i = 0; i < 40 && !saveFocused; i++) { await page.keyboard.press('Tab'); saveFocused = /^Save ৳450/.test((await focusedLabel()) || ''); }
    ok('the Save button is reachable with Tab', saveFocused);
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    ok('Enter on Save records it', (await page.getByText('Safe to Spend is now', { exact: false }).count()) > 0);
    await page.close();
  }
  await b.close(); process.exit(fails ? 1 : 0);
})();
