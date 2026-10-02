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
  await page.getByRole('tab', { name: 'Profile' }).click(); await wait(300);
  // people
  await btn(/^People/).click(); await wait(400);
  ok('people list shows the demo friends', await vis('Rahim') && await vis('Karim'));
  await page.getByLabel("Person's name").fill('rahim'); await btn('Add person').click(); await wait(300);
  ok('duplicate name rejected', await vis('already have one with that name'));
  await page.getByLabel("Person's name").fill('Me'); await btn('Add person').click(); await wait(300);
  ok('"Me" rejected', await vis('"Me" is you'));
  await page.getByLabel("Person's name").fill('Tanvir'); await btn('Add person').click(); await wait(500);
  ok('new person added', await vis('Tanvir'));
  await btn(/^Tanvir/).click(); await wait(300);
  await page.getByLabel('New name').fill('Tanvir Ahmed'); await btn('Save name').click(); await wait(500);
  ok('renamed', await vis('Tanvir Ahmed'));
  await btn('Back').click(); await wait(300);
  // accounts edit
  await btn(/^Accounts/).click(); await wait(400);
  await btn(/^Savings/).click(); await wait(300);
  ok('account edit shows the starting balance', (await page.getByLabel('Starting balance').inputValue()) === '40000');
  await page.getByLabel('Account name').fill('cash'); await btn('Save changes').click(); await wait(300);
  ok('duplicate account name rejected', await vis('already have one with that name'));
  await page.getByLabel('Account name').fill('Rainy day'); await btn('Save changes').click(); await wait(600);
  ok('account renamed', await vis('Rainy day'));
  await btn(/^Rainy day/).click(); await wait(300);
  await btn('Archive account').click(); await wait(600);
  ok('account archived and listed under Archived', await vis('ARCHIVED') && await vis('Hidden from pickers'));
  await btn(/^Rainy day/).click(); await wait(300);
  await btn('Restore account').click(); await wait(600);
  ok('account restored', !(await vis('ARCHIVED')));
  await btn('Back').click(); await wait(300);
  // categories
  await btn(/^Categories/).click(); await wait(400);
  ok('built-in categories are marked and not editable', await vis('Built in'));
  await btn('Add a category').click(); await wait(300);
  await page.getByLabel('Category name').fill('Food'); await btn('Add category').click(); await wait(300);
  ok('duplicate main category rejected', await vis('already have one with that name'));
  await page.getByLabel('Category name').fill('Pets'); await btn('Add category').click(); await wait(600);
  ok('custom category added', await vis('Pets'));
  await btn('Add a category').click(); await wait(300);
  await page.getByLabel('Category name').fill('Vet'); await page.getByRole('dialog').getByRole('button', { name: 'Pets' }).click(); await btn('Add category').click(); await wait(600);
  ok('custom sub-category added', await vis('Vet'));
  await btn(/^Pets/).first().click(); await wait(300);
  await btn('Archive category').click(); await wait(500);
  ok('a category with sub-categories cannot be archived', await vis('Archive its sub-categories first'));
  await page.keyboard.press('Escape'); await btn('Close').first().click().catch(() => {}); await wait(300);
  // capture uses a custom category
  await btn('Back').click(); await wait(300);
  await page.getByRole('tab', { name: 'Home' }).click(); await wait(500);
  const box = page.getByLabel('Describe what happened with your money');
  await box.fill('Spent 800 on Vet'); await box.press('Enter'); await wait(700);
  ok('capture understands a category you added', await page.getByRole('button', { name: /Category: Vet/ }).isVisible().catch(() => false));
  // capture adds a person on the spot
  await page.getByRole('button', { name: /^Discard/ }).click().catch(() => {}); await wait(300);
  await box.fill('Lent Zubair 500'); await box.press('Enter'); await wait(700);
  ok('an unknown person can be added from the question', (await vis('Who is this') || await vis('Someone new')) && await page.getByLabel("Person's name").isVisible());
  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); process.exit(fails ? 1 : 0);
})();
