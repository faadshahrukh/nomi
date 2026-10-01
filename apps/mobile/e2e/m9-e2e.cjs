const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 400, height: 1000 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
  const vis = async (t) => { for (const l of await page.getByText(t, { exact: false }).all()) if (await l.isVisible().catch(() => false)) return true; return false; };
  const wait = (ms = 400) => page.waitForTimeout(ms);
  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' }); await wait(800);
  // Money Pulse
  await page.getByRole('button', { name: 'View details' }).click(); await wait(600);
  ok('money pulse detail opens with accounts and this month', await vis('Money Pulse') && await vis('This month') && await vis('Accounts') && await vis('City Bank'));
  await page.getByRole('button', { name: 'Back' }).click(); await wait(500);
  // Safe to spend
  await page.getByRole('button', { name: /Safe to Spend\./ }).click(); await wait(300);
  await page.getByRole('button', { name: 'Details and safety buffer' }).click(); await wait(600);
  ok('safe to spend detail itemises the calculation', await vis("How it's worked out") && await vis('Bills still due') && await vis('Bills counted'));
  const perDayBefore = await page.getByText(/per day, about/).first().innerText();
  await page.getByRole('textbox', { name: 'Safety buffer' }).fill('abc');
  await page.getByRole('button', { name: 'Save buffer' }).click(); await wait(300);
  ok('bad buffer is rejected with a message', await vis('Enter the buffer as a number'));
  await page.getByRole('textbox', { name: 'Safety buffer' }).fill('10000');
  await page.getByRole('button', { name: 'Save buffer' }).click(); await wait(700);
  const perDayAfter = await page.getByText(/per day, about/).first().innerText();
  ok('saving a buffer lowers what is safe to spend', perDayBefore !== perDayAfter && await vis('Safety buffer saved'));
  await page.getByRole('button', { name: 'Back' }).click(); await wait(500);
  // budgets
  await page.getByRole('tab', { name: 'Planning' }).click(); await wait(500);
  await page.getByRole('button', { name: 'Add a budget' }).click(); await wait(300);
  await page.getByLabel('Budget amount').fill('0');
  await page.getByRole('button', { name: 'Save budget' }).click(); await wait(300);
  ok('zero budget rejected', await vis('Enter a number above zero'));
  await page.getByRole('button', { name: 'Bills', exact: true }).click();
  await page.getByLabel('Budget amount').fill('8k');
  await page.getByRole('button', { name: 'Save budget' }).click(); await wait(700);
  ok('new Bills budget appears', await page.getByRole('button', { name: 'Bills budget. Tap to edit.' }).isVisible() && await vis('Budget saved'));
  await page.getByRole('button', { name: 'Bills budget. Tap to edit.' }).click(); await wait(300);
  ok('editing shows the current amount', (await page.getByLabel('Budget amount').inputValue()) === '8000');
  await page.getByLabel('Budget amount').fill('9000');
  await page.getByRole('button', { name: 'Save budget' }).click(); await wait(700);
  ok('edit replaces, not duplicates', (await page.getByRole('button', { name: 'Bills budget. Tap to edit.' }).count()) === 1 && await vis('9,000'));
  await page.getByRole('button', { name: 'Bills budget. Tap to edit.' }).click(); await wait(300);
  await page.getByRole('button', { name: 'Remove budget' }).click();
  ok('remove asks first', await vis('Remove this budget?'));
  await page.getByRole('button', { name: 'Remove', exact: true }).click(); await wait(700);
  ok('budget removed', (await page.getByRole('button', { name: 'Bills budget. Tap to edit.' }).count()) === 0);
  // what changed drill-down
  await page.getByRole('tab', { name: 'Insights' }).click(); await wait(500);
  const driver = page.getByRole('button', { name: /Opens the transactions/ }).first();
  const label = await driver.getAttribute('aria-label');
  const cat = label.split(',')[0];
  await driver.click(); await wait(1500);
  ok(`driver tap opens transactions for ${cat} this month`, page.url().includes('/transactions') && await page.getByRole('button', { name: /Filters, 2 active/ }).isVisible() && (await page.getByRole('button', { name: /Opens details/ }).count()) > 0);
  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); process.exit(fails ? 1 : 0);
})();
