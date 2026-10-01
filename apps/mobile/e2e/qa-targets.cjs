const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 400, height: 1000 } });
  const bad = new Map(); let n = 0;
  const scan = async (name, min = 44) => {
    await page.waitForTimeout(600);
    const r = await page.evaluate((min) => [...document.querySelectorAll('button,[role=button],[role=tab],[role=radio],a,input,textarea')].filter((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight + 3000;
    }).map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: (e.getAttribute('aria-label') || e.innerText || e.placeholder || e.tagName).slice(0, 40) }; }).filter((x) => x.h < min || x.w < min), min);
    for (const x of r) { n++; const k = `${x.label} ${x.w}x${x.h}`; if (!bad.has(k)) bad.set(k, []); bad.get(k).push(name); }
  };
  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await scan('Home');
  for (const tab of ['Transactions', 'Insights', 'Planning', 'Profile']) { await page.getByRole('tab', { name: tab }).click(); await scan(tab); }
  await page.getByRole('tab', { name: 'Planning' }).click();
  for (const s of ['Goals', 'Recurring']) { await page.getByRole('button', { name: s, exact: true }).click(); await scan('Planning/' + s); }
  await page.getByRole('tab', { name: 'Profile' }).click();
  for (const [btn, name] of [[/Privacy and data/, 'Privacy'], [/Notifications/, 'Notifications'], [/Backup and sync/, 'Sync']]) { await page.getByRole('button', { name: btn }).first().click(); await scan(name); await page.getByRole('button', { name: 'Back' }).click(); await page.waitForTimeout(300); }
  for (const [k, v] of bad) console.log(`${k}  on ${[...new Set(v)].join(', ')}`);
  console.log(`\n${bad.size} distinct undersized targets`);
  await b.close();
})();
