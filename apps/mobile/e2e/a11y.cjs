const { chromium } = require('playwright');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SCHEMES = process.argv[2] ? [process.argv[2]] : ['light', 'dark'];
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  let total = 0;
  const seen = new Map();
  for (const scheme of SCHEMES) {
    const ctx = await b.newContext({ viewport: { width: 400, height: 1000 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const scan = async (name) => {
      await page.waitForTimeout(700);
      await page.evaluate(axeSrc);
      const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
      for (const v of r.violations) {
        const key = `${v.id}`;
        const nodes = v.nodes.slice(0, 3).map((n) => n.html.replace(/class="[^"]*"/g, '').slice(0, 140));
        total += v.nodes.length;
        const line = `[${scheme}] ${name}: ${v.id} (${v.impact}) x${v.nodes.length} - ${v.help}\n      ${nodes.join('\n      ')}`;
        console.log(line);
        seen.set(key, (seen.get(key) || 0) + v.nodes.length);
      }
    };
    await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
    await scan('Home');
    for (const tab of ['Transactions', 'Insights', 'Planning', 'Profile']) { await page.getByRole('tab', { name: tab }).click(); await scan(tab); }
    // planning sections
    await page.getByRole('tab', { name: 'Planning' }).click();
    for (const s of ['Goals', 'Recurring']) { await page.getByRole('button', { name: s, exact: true }).click(); await scan('Planning/' + s); }
    // detail screens via the UI so state persists (the web store is in memory)
    await page.getByRole('tab', { name: 'Home' }).click();
    for (const [btn, name] of [[/View details/, 'MoneyPulse'], [/Safe to Spend\./, null]]) {
      if (!name) continue;
      await page.getByRole('button', { name: btn }).first().click(); await scan(name); await page.getByRole('button', { name: 'Back' }).click(); await page.waitForTimeout(300);
    }
    await page.getByRole('tab', { name: 'Profile' }).click();
    for (const [btn, name] of [[/Privacy and data/, 'Privacy'], [/Notifications/, 'Notifications'], [/Backup and sync/, 'Sync'], [/Accounts/, 'Accounts']]) {
      await page.getByRole('button', { name: btn }).first().click(); await scan(name); await page.getByRole('button', { name: 'Back' }).click(); await page.waitForTimeout(300);
    }
    await page.getByRole('tab', { name: 'Transactions' }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Opens details/ }).first().click(); await scan('TransactionDetail');
    await ctx.close();
  }
  console.log(`\nTOTAL violating nodes: ${total}`); console.log([...seen.entries()].map(([k, v]) => `${k}:${v}`).join('  '));
  await b.close(); process.exit(total ? 1 : 0);
})();
