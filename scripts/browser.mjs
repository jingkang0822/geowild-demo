import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');
const artifacts = path.join(root, 'artifacts');
const base = process.env.DEMO_URL ?? 'https://geowild.test/geowild-demo/';
const origin = new URL(base);
const key = 'geowild-demo:v1';
const expected = JSON.parse(await readFile(path.join(site, 'release.json'), 'utf8'));
const report = { base, identity: expected.identity, browser: '', checks: [], loadedHashes: {}, errors: [], warnings: [], expectedResourceErrors: [], external: [] };
const localShell = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const executablePath = process.env.DEMO_BROWSER_EXECUTABLE ?? (existsSync(localShell) ? localShell : undefined);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, timeout: 20000, args: ['--disable-background-networking', '--enable-unsafe-swiftshader'] });
report.browser = browser.version();
let lastPage;
async function makeContext({ mobile = false, init, photoFailure = false, clipboardFailure = false } = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', serviceWorkers: 'block' });
  ctx.setDefaultTimeout(12000);
  ctx.setDefaultNavigationTimeout(25000);
  if (init) await ctx.addInitScript(init);
  if (clipboardFailure) await ctx.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Copy denied for fallback test'); } } }));
  const failed = new Set();
  let failNextPhoto = photoFailure;
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname) || route.request().method() !== 'GET') {
      report.external.push(url.href);
      await route.abort();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(origin.pathname.length)) || 'index.html';
    if (failNextPhoto && relative.startsWith('assets/animals/')) {
      failNextPhoto = false;
      failed.add(url.href);
      await route.fulfill({ status: 503, body: '', contentType: 'image/jpeg' });
      return;
    }
    if (process.env.DEMO_URL) { await route.continue(); return; }
    assert.ok(relative === 'release.json' || Object.hasOwn(expected.files, relative), `Unexpected asset ${relative}`);
    const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain' }[path.extname(relative)] ?? 'application/octet-stream';
    await route.fulfill({ body: await readFile(path.join(site, relative)), contentType });
  });
  const p = await ctx.newPage();
  lastPage = p;
  const responses = new Map();
  p.on('response', response => { if (response.status() === 200) responses.set(new URL(response.url()).pathname, response); });
  p.on('pageerror', error => report.errors.push(error.message));
  p.on('console', event => {
    if (event.type() === 'warning') report.warnings.push(event.text());
    if (event.type() === 'error') {
      if (failed.has(event.location().url) && /503/.test(event.text())) report.expectedResourceErrors.push(event.text());
      else report.errors.push(event.text());
    }
  });
  return { ctx, p, responses };
}
async function check(name, fn) { await fn(); report.checks.push(name); console.log(`PASS ${name}`); }
async function saved(p) { return p.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
async function ready(p) { await expect(p.locator('#center-guess')).toBeEnabled(); }
async function submit(p) { await ready(p); await p.locator('#center-guess').click(); await expect(p.locator('#answer-panel')).toBeVisible(); }
async function finish(p) {
  for (let i = 0; i < 5; i++) { await submit(p); await p.locator('#next-button').click(); }
  await expect(p.locator('#results-view')).toBeVisible();
  await expect(p.locator('.result-row')).toHaveCount(5);
}
async function closeDialog(p) {
  const title = await p.locator('#dialog-title').innerText();
  await p.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await p.waitForFunction(previous => !document.querySelector('#info-dialog').open || document.querySelector('#dialog-title').textContent !== previous, title);
  if (await p.getByRole('dialog').isVisible()) {
    await expect(p.getByRole('dialog')).toHaveAccessibleName('Explore GeoWild');
    await p.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
  await expect(p.getByRole('dialog')).toBeHidden();
}
async function openMenu(p, route) { await p.getByRole('button', { name: 'Open menu', exact: true }).click(); await p.locator(`[data-route="${route}"]`).click(); }
try {
  const main = await makeContext({ clipboardFailure: true, init: () => localStorage.setItem('geowild:v1', 'original-site-sentinel') });
  const { p } = main;
  await check('release-identity: metadata, all 17 photos, actual loaded assets', async () => {
    await p.goto(base);
    await expect(p).toHaveTitle('GeoWild — Animal Geography Demo');
    await expect(p.getByText('PORTFOLIO DEMO · 17 ANIMALS', { exact: true })).toBeVisible();
    assert.equal(await p.locator('link[rel="canonical"]').getAttribute('href'), expected.site);
    const release = await p.evaluate(async () => (await fetch('./release.json')).json());
    assert.equal(release.identity, expected.identity);
    assert.equal(await p.evaluate(() => window.ANIMALS.length), 17);
    const decoded = await p.evaluate(async () => Promise.all(window.ANIMALS.map(animal => new Promise((resolve, reject) => {
      const photo = new Image(); photo.onload = () => photo.naturalWidth > 0 ? resolve(animal.image) : reject(new Error(animal.id)); photo.onerror = () => reject(new Error(animal.id)); photo.src = animal.image;
    }))));
    assert.equal(decoded.length, 17);
    for (const name of ['index.html', 'styles.css', 'vendor/maplibre-gl.css', 'vendor/maplibre-gl.js', 'js/world.js', 'js/animals.js', 'js/engine.js', 'js/globe.js', 'js/app.js', ...decoded]) {
      const response = main.responses.get(name === 'index.html' ? origin.pathname : new URL(name, base).pathname);
      assert.ok(response, `Missing loaded response ${name}`);
      const actual = createHash('sha256').update(await response.body()).digest('hex');
      assert.equal(actual, expected.files[name].sha256, name);
      report.loadedHashes[name] = actual;
    }
    await p.screenshot({ path: path.join(artifacts, 'desktop-home.png'), fullPage: true });
  });
  await check('entry-navigation: rules, credits, stats, menu, Escape and Back', async () => {
    await p.keyboard.press('Tab'); await p.getByRole('link', { name: 'Skip to content', exact: true }).click();
    await expect(p.locator('#main')).toBeFocused();
    await p.locator('#home-rules').click(); await expect(p.getByRole('dialog')).toHaveAccessibleName('Rules & scoring');
    await p.keyboard.press('Escape'); await expect(p.getByRole('dialog')).toBeHidden();
    await p.locator('#home-credits').click(); await expect(p.locator('.credit-item')).toHaveCount(17);
    const links = await p.locator('#dialog-content a').evaluateAll(links => links.map(link => ({ href: link.href, rel: link.rel })));
    assert.ok(links.length > 50 && links.every(link => link.href.startsWith('https:') && link.rel.includes('noopener')));
    await p.goBack(); await expect(p.getByRole('dialog')).toBeHidden();
    await openMenu(p, 'stats'); await expect(p.getByRole('dialog')).toHaveAccessibleName('Local stats'); await closeDialog(p);
    await openMenu(p, 'rules'); await expect(p.getByRole('dialog')).toHaveAccessibleName('Rules & scoring'); await closeDialog(p);
    await openMenu(p, 'credits'); await expect(p.locator('.credit-item')).toHaveCount(17); await closeDialog(p);
    await openMenu(p, 'home'); await expect(p.locator('#home-view')).toBeVisible();
    await p.locator('#footer-rules').click(); await closeDialog(p);
  });
  await check('game-loop: real globe drag, zoom, reset, confirmation and five rounds', async () => {
    await p.getByRole('button', { name: 'PLAY', exact: true }).click(); await ready(p);
    const canvas = p.locator('.maplibregl-canvas'); await canvas.scrollIntoViewIfNeeded();
    const beforeZoom = await canvas.screenshot();
    await p.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const afterZoom = await canvas.screenshot(); assert.notDeepEqual(afterZoom, beforeZoom);
    await p.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await p.getByRole('button', { name: 'Reset globe view', exact: true }).click();
    await canvas.focus(); await p.keyboard.press('ArrowRight');
    const box = await canvas.boundingBox();
    await p.mouse.move(box.x + box.width * .55, box.y + box.height * .5); await p.mouse.down();
    await p.mouse.move(box.x + box.width * .55 - 100, box.y + box.height * .5 + 25, { steps: 20 }); await p.mouse.up();
    await expect(p.locator('#answer-panel')).toBeHidden(); assert.equal((await saved(p)).practice.results.length, 0);
    await submit(p);
    const first = (await saved(p)).practice.results[0];
    assert.ok(Math.abs(first.guess[0] - 15) > .01 || Math.abs(first.guess[1] - 12) > .01, 'Dragging actually moves the globe camera');
    await p.reload(); await expect(p.locator('#answer-panel')).toBeVisible(); assert.deepEqual((await saved(p)).practice.results[0], first);
    await p.locator('#next-button').click(); await ready(p);
    await p.getByLabel('Confirm location before locking in').check();
    await p.getByRole('button', { name: 'Place pin at map center', exact: true }).click();
    assert.equal((await saved(p)).practice.results.length, 1);
    await p.getByRole('button', { name: 'Lock it in →', exact: true }).click();
    await expect(p.locator('#answer-panel')).toBeVisible(); assert.equal((await saved(p)).practice.results.length, 2);
    await p.locator('#next-button').click(); await ready(p); await p.getByLabel('Confirm location before locking in').uncheck();
    for (let i = 2; i < 5; i++) { await submit(p); await p.locator('#next-button').click(); }
    await expect(p.locator('.result-row')).toHaveCount(5);
    const practice = (await saved(p)).practice; assert.equal(practice.stage, 'complete');
    const sum = practice.results.reduce((total, result) => total + result.points, 0);
    assert.equal(Number((await p.locator('#final-score').innerText()).replaceAll(',', '')), sum);
    assert.ok(sum >= 0 && sum <= 1000);
    await p.screenshot({ path: path.join(artifacts, 'desktop-results.png'), fullPage: true });
  });
  await check('daily-practice-share: demo URL, namespace isolation and repeat play', async () => {
    await p.getByRole('button', { name: 'Copy score', exact: true }).click();
    await expect(p.locator('#share-status')).toContainText('did not allow automatic copying');
    const text = await p.locator('#share-text').inputValue(); assert.ok(text.includes(expected.site)); assert.ok(!text.includes('chatgpt.site'));
    assert.equal(await p.evaluate(() => localStorage.getItem('geowild:v1')), 'original-site-sentinel');
    const practice = JSON.stringify((await saved(p)).practice);
    await p.getByRole('button', { name: 'Back to home', exact: true }).click(); await p.locator('#daily-button').click(); await ready(p);
    await expect(p.locator('#mode-label')).toHaveText('DAILY CHALLENGE'); await finish(p);
    assert.equal(JSON.stringify((await saved(p)).practice), practice);
    const daily = JSON.stringify((await saved(p)).daily);
    await openMenu(p, 'results'); await expect(p.locator('#results-view')).toBeVisible();
    await p.locator('#practice-button').click(); await ready(p); assert.equal((await saved(p)).practice.results.length, 0);
    assert.equal(JSON.stringify((await saved(p)).daily), daily);
    await p.getByRole('button', { name: 'GeoWild home', exact: true }).click();
    await p.getByRole('button', { name: 'PLAY', exact: true }).click(); await ready(p);
    await openMenu(p, 'today'); await expect(p.locator('#results-view')).toBeVisible();
    await p.reload(); await expect(p.locator('.result-row')).toHaveCount(5);
  });
  await main.ctx.close();
  await check('mobile: touch globe answer and 390px layout', async () => {
    const { p, ctx } = await makeContext({ mobile: true }); await p.goto(base);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.getByRole('button', { name: 'PLAY', exact: true }).click(); await ready(p);
    const canvas = p.locator('.maplibregl-canvas'); await canvas.scrollIntoViewIfNeeded(); const box = await canvas.boundingBox();
    await p.touchscreen.tap(box.x + box.width * .5, box.y + box.height * .5);
    await expect(p.locator('#answer-panel')).toBeVisible(); assert.equal((await saved(p)).practice.results.length, 1);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: path.join(artifacts, 'mobile-play.png'), fullPage: true }); await ctx.close();
  });
  await check('recovery: failed photo gates guessing and retries the same question', async () => {
    const { p, ctx } = await makeContext({ photoFailure: true }); await p.goto(base); await p.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(p.getByRole('button', { name: 'Retry this photo', exact: true })).toBeVisible();
    await expect(p.locator('#center-guess')).toBeDisabled(); const ids = (await saved(p)).practice.animalIds;
    await p.getByRole('button', { name: 'Retry this photo', exact: true }).click(); await ready(p); await submit(p);
    assert.deepEqual((await saved(p)).practice.animalIds, ids); assert.equal((await saved(p)).practice.results.length, 1); await ctx.close();
  });
  await check('recovery: missing map component shows reload and keeps the round', async () => {
    const { p, ctx } = await makeContext(); await p.goto(base);
    await p.evaluate(() => { window.testWorldData = window.WORLD_DATA; window.WORLD_DATA = null; });
    await p.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(p.locator('#map-status')).toContainText('Local globe components did not load');
    await expect(p.locator('#center-guess')).toBeDisabled(); const ids = (await saved(p)).practice.animalIds;
    await p.evaluate(() => { window.WORLD_DATA = window.testWorldData; delete window.testWorldData; });
    await p.getByRole('button', { name: 'Reload globe', exact: true }).click(); await submit(p);
    await expect(p.locator('#map-status')).toBeHidden(); assert.deepEqual((await saved(p)).practice.animalIds, ids);
    assert.equal((await saved(p)).practice.results.length, 1); await ctx.close();
  });
  await check('recovery: corrupt demo save is preserved while the game remains usable', async () => {
    const { p, ctx } = await makeContext({ init: () => localStorage.setItem('geowild-demo:v1', '{broken') });
    await p.goto(base); await expect(p.locator('#global-notice')).toContainText('original data is preserved');
    await p.getByRole('button', { name: 'PLAY', exact: true }).click(); await submit(p);
    assert.equal(await p.evaluate(key => localStorage.getItem(key), key), '{broken'); await ctx.close();
  });
  await check('recovery: blocked storage retries without losing the session answer', async () => {
    const { p, ctx } = await makeContext({ init: () => {
      window.allowStorage = false; const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(...args) { if (!window.allowStorage) throw new Error('Blocked for recovery test'); return get.apply(this, args); };
      Storage.prototype.setItem = function(...args) { if (!window.allowStorage) throw new Error('Blocked for recovery test'); return set.apply(this, args); };
    } });
    await p.goto(base); await expect(p.locator('#global-notice')).toContainText('cannot read local storage');
    await p.getByRole('button', { name: 'PLAY', exact: true }).click(); await submit(p);
    await p.evaluate(() => window.allowStorage = true); await p.getByRole('button', { name: 'Retry saving', exact: true }).click();
    assert.equal((await saved(p)).practice.results.length, 1); await expect(p.locator('#global-notice')).toBeHidden(); await ctx.close();
  });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true });
    console.error((await lastPage.locator('body').innerText()).slice(-2500));
  }
  throw error;
} finally {
  await browser.close();
  await writeFile(path.join(artifacts, process.env.DEMO_URL ? 'deployed-browser.json' : 'browser.json'), JSON.stringify(report, null, 2) + '\n');
}
