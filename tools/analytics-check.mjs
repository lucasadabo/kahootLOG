import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const live = process.argv.includes('--live');
const origin = 'https://fr.adabo.com.br';
const browser = await chromium.launch({
  executablePath: process.env.ANALYTICS_BROWSER_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),
  headless: false, ignoreDefaultArgs: ['--enable-automation'],
  // Make this authorized synthetic visit eligible for the Analytics collector.
  args: ['--disable-blink-features=AutomationControlled', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const views = [], responses = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.url().includes('/_vercel/insights/') && request.method() === 'POST') {
    views.push({ endpoint: new URL(request.url()).pathname, referrerHeader: request.headers().referer, payload: request.postDataJSON() });
  }
});
page.on('response', response => {
  if (response.url().includes('/_vercel/insights/')) responses.push({ path: new URL(response.url()).pathname, status: response.status() });
});
async function expectPaths(paths) {
  await page.waitForTimeout(700);
  assert.deepEqual(views.map(view => new URL(view.payload.o).pathname), paths);
  assert.equal(await page.locator('script[src*="/_vercel/insights/script.js"]').count(), 1);
}
try {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'referrer', { value: 'https://adabo.com.br/private/fixture-player?token=fixture#pin', configurable: true });
    localStorage.setItem('__va_attribution', JSON.stringify({ userId: 'fixture-player', traits: { email: 'fixture@example.com' } }));
  });
  if (!live) {
    const collectorResponse = await fetch('https://va.vercel-scripts.com/v1/script.js', { signal: AbortSignal.timeout(30000) });
    assert.equal(collectorResponse.status, 200);
    const collectorScript = await collectorResponse.text();
    await page.route(`${origin}/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/_vercel/insights/script.js') return route.fulfill({ contentType: 'text/javascript', body: collectorScript });
      if (path.startsWith('/_vercel/insights/')) return route.fulfill({ status: 200, body: '{}' });
      const file = path.startsWith('/assets/') || path.startsWith('/brand/') || path === '/favicon.svg' ? `dist${path}` : 'dist/index.html';
      return route.fulfill({ body: await readFile(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : 'image/png' });
    });
  }
  await page.goto(`${origin}/?nickname=fixture&pin=123456&token=fixture#fixture`);
  await page.waitForFunction(() => window.vai === true);
  await expectPaths(['/']);
  await page.getByRole('button', { name: 'Entrar no Jogo 🎮', exact: true }).click();
  await expectPaths(['/', '/join']);
  await page.getByPlaceholder('PIN do jogo').fill('123456');
  await page.getByPlaceholder('Seu nickname').fill('fixture-player');
  await expectPaths(['/', '/join']);
  await page.goBack();
  await expectPaths(['/', '/join', '/']);
  await page.getByRole('button', { name: 'Painel do Professor' }).click();
  await expectPaths(['/', '/join', '/', '/admin']);
  await page.goBack();
  await expectPaths(['/', '/join', '/', '/admin', '/']);
  await page.evaluate(() => { history.pushState({}, '', '/perguntas?token=fixture'); dispatchEvent(new PopStateEvent('popstate')); });
  await expectPaths(['/', '/join', '/', '/admin', '/', '/perguntas']);
  await page.evaluate(() => { history.pushState({}, '', '/room/fixture-pin?nickname=fixture'); dispatchEvent(new PopStateEvent('popstate')); });
  await expectPaths(['/', '/join', '/', '/admin', '/', '/perguntas']);
  await page.evaluate(() => { history.pushState({}, '', '/?token=fixture'); dispatchEvent(new PopStateEvent('popstate')); });
  await expectPaths(['/', '/join', '/', '/admin', '/', '/perguntas', '/']);
  await page.evaluate(() => window.va('event', { name: 'fixture-secret', data: { nickname: 'fixture-player' } }));
  await expectPaths(['/', '/join', '/', '/admin', '/', '/perguntas', '/']);
  for (const view of views) {
    assert.equal(view.endpoint, '/_vercel/insights/view');
    assert.ok(!view.referrerHeader || view.referrerHeader === `${origin}/`);
    assert.ok(!JSON.stringify(view).includes('fixture'));
    assert.ok(!('userId' in view.payload) && !('props' in view.payload));
    assert.ok(!new URL(view.payload.o).search && !new URL(view.payload.o).hash);
  }
  assert.equal(views[0].payload.r, 'https://adabo.com.br/');
  assert.deepEqual(errors, []);
  assert.ok(responses.every(response => response.status === 200));
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/analytics-${live ? 'production' : 'local'}.png` });
  const result = { mode: live ? 'production' : 'local', views, responses, errors };
  await writeFile(`artifacts/analytics-${live ? 'production' : 'local'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
