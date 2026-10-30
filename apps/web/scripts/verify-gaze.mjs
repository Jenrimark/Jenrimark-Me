import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:3100/';
const output = process.env.GAZE_QA_OUTPUT || '/tmp/jenrimark-gaze-qa';
const delay = Number(process.env.GAZE_NETWORK_DELAY_MS || 0);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const spec = await (await fetch(new URL('/scenes/story-v6/story-video.json', url))).json();
const assetURL = new URL(`${spec.gazeFramesDir}000000.webp`, url);
const asset = await fetch(assetURL);
assert.equal(asset.status, 200);
assert.match(asset.headers.get('cache-control') || '', /max-age=31536000/);
assert.match(asset.headers.get('cache-control') || '', /immutable/);
const local = await readFile(new URL(`../public${spec.gazeFramesDir}000000.webp`, import.meta.url));
assert.equal(hash(new Uint8Array(await asset.arrayBuffer())), hash(local));
const legacy = await fetch(new URL('/scenes/story-v6/gaze-hd/000000.webp', url));
assert.equal(legacy.status, 200);
assert.equal(hash(new Uint8Array(await legacy.arrayBuffer())), hash(local));

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
const errors = [];
await page.route('**/media/scene-stills/00-about.png', async (route) => {
  const response = await route.fetch();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await route.fulfill({ response });
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => {
  if (/\/gaze-hd[^/]*\//.test(request.url())) failures.push({ url: request.url(), error: request.failure()?.errorText });
});
if (delay > 0) {
  await page.route(/\/gaze-hd[^/]*\/.*\.webp$/, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ response });
  });
}
await page.addInitScript(() => {
  const probe = window.__gazeQA = { changes: [], loads: [], gaps: [], longTasks: [] };
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...descriptor,
    set(src) {
      if (this.classList.contains('scene-stable-frame') && String(src).startsWith('blob:')) {
        probe.changes.push({ time: performance.now(), src: String(src) });
      }
      descriptor.set.call(this, src);
    },
  });
  document.addEventListener('load', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('scene-stable-frame') && event.target.src.startsWith('blob:')) {
      probe.loads.push({ time: performance.now(), src: event.target.src });
    }
  }, true);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  let previous = 0;
  function tick(time) {
    if (previous) probe.gaps.push({ time, duration: time - previous });
    previous = time;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});

async function movePointer() {
  return page.evaluate(async () => {
    const start = performance.now();
    for (let index = 0; index < 240; index += 1) {
      const angle = index / 239 * Math.PI * 4;
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: innerWidth / 2 + Math.sin(angle) * innerWidth * 0.36,
        clientY: innerHeight / 2 + Math.cos(angle) * innerHeight * 0.36,
        pointerType: 'mouse', bubbles: true,
      }));
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    const end = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const probe = window.__gazeQA;
    const changes = probe.changes.filter((entry) => entry.time >= start && entry.time <= end);
    const loads = probe.loads.filter((entry) => entry.time >= start && entry.time <= end);
    return {
      spanMs: Math.round(end - start),
      pointerEvents: 240,
      visibleFrameChanges: changes.length,
      visibleImageLoads: loads.length,
      longTasks: probe.longTasks.filter((entry) => entry.start >= start && entry.start <= end),
      rafGapsOver50ms: probe.gaps.filter((entry) => entry.time >= start && entry.time <= end && entry.duration > 50).length,
      loaded: Number(document.querySelector('#v3-scene').dataset.gazeLoaded),
      decoded: Number(document.querySelector('#v3-scene').dataset.gazeDecoded),
    };
  });
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('story-video-mode'));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', {
    clientX: innerWidth * 0.9, clientY: innerHeight * 0.5, pointerType: 'mouse', bubbles: true,
  })));
  await page.waitForFunction(() => document.querySelector('.scene-stable-frame')?.naturalWidth > 0);
  await page.waitForFunction(() => document.querySelector('#v3-scene')?.dataset.gazeFrame === '60', null, { timeout: 4000 });
  const cold = await movePointer();
  await page.waitForFunction(() => Number(document.querySelector('#v3-scene')?.dataset.gazeLoaded) === 241, null, { timeout: 60000 });
  const warm = await movePointer();
  assert.equal(failures.length, 0, JSON.stringify(failures));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(warm.decoded <= 24, 'decoded cache must remain bounded');
  assert.ok(warm.visibleImageLoads >= 190, `cached gaze did not keep up: ${JSON.stringify(warm)}`);
  assert.equal(await page.locator('.scene-stable-frame').evaluate((image) => image.naturalWidth), 1280);
  await page.mouse.wheel(0, 220);
  await page.waitForFunction(() => document.querySelector('#v3-scene')?.dataset.storyPhase === 'playing', null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('#v3-scene')?.dataset.storyPage === '1' && document.querySelector('#v3-scene')?.dataset.storyPhase === 'idle', null, { timeout: 7000 });
  await page.mouse.wheel(0, -220);
  await page.waitForFunction(() => document.querySelector('#v3-scene')?.dataset.storyPhase === 'playing', null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('#v3-scene')?.dataset.storyPage === '0' && document.querySelector('#v3-scene')?.dataset.storyPhase === 'idle', null, { timeout: 7000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('story:navigate', { detail: { page: 1 } })));
  await page.waitForFunction(() => document.querySelector('.scene-stable-frame')?.src.includes('01-experience.png'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('story:navigate', { detail: { page: 0 } })));
  await page.waitForFunction(() => document.querySelector('.scene-stable-frame')?.src.startsWith('blob:'));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/desktop.png` });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobileGaze = [];
  mobile.on('request', (request) => { if (/\/gaze-hd[^/]*\//.test(request.url())) mobileGaze.push(request.url()); });
  await mobile.goto(url, { waitUntil: 'domcontentloaded' });
  await mobile.waitForFunction(() => document.querySelector('.scene-stable-frame')?.naturalWidth > 0);
  await mobile.waitForTimeout(1200);
  assert.equal(mobileGaze.length, 0, 'touch-only devices should not warm mouse gaze assets');
  await mobile.screenshot({ path: `${output}/mobile.png` });
  const report = { url, delayMs: delay, cold, warm, canceledGazeRequests: failures.length, pageErrors: errors, mobileGazeRequests: mobileGaze.length, originalImageBytesVerified: true, forwardAndReverseVideoVerified: true, initialPointerTargetPreserved: true };
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
