const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 400, height: 1100 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
  const vis = async (t) => { for (const l of await page.getByText(t, { exact: false }).all()) if (await l.isVisible().catch(() => false)) return true; return false; };
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const btn = (n, o = {}) => page.getByRole('button', { name: n, ...o });
  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' }); await wait(900);
  // radar on home
  ok('home shows at most two signals plus see-all', await vis('Food is over budget') && await vis('Shopping is on track') && await btn(/See all 4/).isVisible());
  await btn('Dismiss: Food is over budget').click(); await wait(500);
  ok('dismissing hides it and the next one fills in', !(await vis('Food is over budget')) && await vis('Your monthly budget is on track'));
  await btn(/See all/).click(); await wait(600);
  ok('radar screen lists the rest, urgent first', await vis('Financial Radar') && await vis('Shopping is on track'));
  await btn(/^Coming up. Shopping is on track/).click(); await wait(600);
  ok('a signal opens the budgets', await vis('Budgets') && page.url().includes('/planning'));
  // recurring: validation
  await btn('Recurring', { exact: true }).click(); await wait(400);
  await btn('Add recurring').click(); await wait(300);
  await btn('Add', { exact: true }).click(); await wait(300);
  ok('empty form rejected with plain messages', await vis('Give it a name') && await vis('Enter the amount'));
  await page.getByLabel('Name', { exact: true }).fill('Gym');
  await page.getByLabel('Amount', { exact: true }).fill('1500');
  await page.getByLabel('Due date').fill('2025-02-30');
  await btn('Add', { exact: true }).click(); await wait(300);
  ok('impossible date rejected', await vis('real date'));
  await page.getByLabel('Due date').fill('2025-03-12'); // monthly from the 12th: overdue by 3 days
  await btn('Add', { exact: true }).click(); await wait(700);
  ok('rule added and shown overdue', await vis('Gym') && await vis('Overdue since'));
  // radar sees it
  await page.getByRole('tab', { name: 'Home' }).click(); await wait(600);
  ok('overdue bill leads Home as urgent', await vis('Gym was due 3 days ago') && await vis('NEEDS ATTENTION'));
  await page.getByRole('tab', { name: 'Planning' }).click(); await wait(400);
  await btn('Recurring', { exact: true }).click(); await wait(300);
  await btn('Mark Gym paid').click(); await wait(800);
  ok('mark paid confirms and clears the overdue state', await vis('Recorded as paid') && !(await vis('Overdue since')));
  await page.getByRole('tab', { name: 'Home' }).click(); await wait(600);
  ok('the signal is gone once paid', !(await vis('Gym was due')));
  await page.getByRole('tab', { name: 'Transactions' }).click(); await wait(500);
  await page.getByLabel('Search transactions').fill('Gym'); await wait(400);
  ok('the payment is in the ledger with its amount', (await page.getByRole('button', { name: /Gym, Expense, 1,500 taka/ }).count()) === 1);
  // pause / resume
  await page.getByRole('tab', { name: 'Planning' }).click(); await wait(400);
  await btn('Recurring', { exact: true }).click(); await wait(300);
  await btn('Edit Gym').click(); await wait(400);
  ok('edit shows the saved amount', (await page.getByLabel('Amount', { exact: true }).inputValue()) === '1500');
  await btn('Pause').click(); await wait(600);
  ok('paused rules are marked and never due', await vis('Paused'));
  await btn('Edit Gym').click(); await wait(400);
  await btn('Resume').click(); await wait(600);
  ok('resume brings it back', !(await vis('Paused')) && await vis('Next'));
  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); process.exit(fails ? 1 : 0);
})();
