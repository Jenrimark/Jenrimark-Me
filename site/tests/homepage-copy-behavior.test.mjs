import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../page.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../page.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('scene copy updates synchronously as one content group', () => {
  assert.match(page, /function renderSceneCopy\(/);
  assert.doesNotMatch(page, /setTimeout\(/);
});

test('chapter visibility uses hard state changes without motion filters', () => {
  assert.match(css, /A \/ 角色舞台/);
  assert.match(css, /\.chapter\.timeline-active[^\{]*\{[^}]*transition:none/s);
  assert.match(css, /\.chapter\.timeline-active[^\{]*\{[^}]*filter:none/s);
  assert.match(css, /\.scene-copy\{transition:none/);
});

test('homepage does not render the removed title-only layer', () => {
  assert.doesNotMatch(html, /title-only/);
  assert.match(html, /scene-spacer/);
});

test('homepage identity shows name, dual-role line, and eight personal tags', () => {
  assert.match(html, /class="scene-identity"/);
  assert.match(html, /class="scene-identity-name">吴汉东</);
  assert.match(html, /AI产品经理 · AI全栈应用开发 · 27届本科/);
  assert.equal((html.match(/class="scene-identity-tags"/g) || []).length, 1);
  const tags = html.match(/<li>[^<]+<\/li>/g) || [];
  assert.equal(tags.length, 8, `expected 8 tags, got ${tags.length}`);
});

test('identity lives only inside the about panel; other scenes have their own copy', () => {
  // Five independent scene panels, each with its own tag/title/body.
  assert.equal((html.match(/class="scene-panel"/g) || []).length, 5);
  const about = html.match(/<section class="scene-panel" data-scene="about">[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(about.includes('scene-identity'), 'about panel owns the identity block');
  assert.ok(about.includes('吴汉东'), 'about panel owns the name');
  for (const id of ['experience', 'projects', 'work', 'contact']) {
    const panel = html.match(new RegExp(`<section class="scene-panel" data-scene="${id}"[\\s\\S]*?<\\/section>`))?.[0] || '';
    assert.ok(panel, `missing panel for ${id}`);
    assert.ok(!panel.includes('scene-identity'), `${id} panel must not contain identity`);
    assert.ok(!panel.includes('吴汉东'), `${id} panel must not contain the name`);
    assert.ok(panel.includes('scene-copy-tag'), `${id} panel has its own tag`);
    assert.ok(panel.includes('<h1>'), `${id} panel has its own title`);
  }
  // Switching scenes swaps panels; it does not toggle a shared identity node.
  assert.match(page, /panel\.hidden=panel\.dataset\.scene!==scene\.id/);
  assert.doesNotMatch(page, /identity\.hidden/);
  assert.match(css, /\.scene-panel\[hidden\]\{display:none/);
});

test('home identity title is smaller, sits higher, and places Prompt engineering on row two', () => {
  const promptIndex = html.indexOf('<li>Prompt 工程</li>');
  const priorTagIndex = html.indexOf('<li>0→1 产品</li>');

  assert.ok(promptIndex > priorTagIndex, 'Prompt 工程 should begin the second row');
  assert.match(css, /\.scene-copy\{[^}]*top:46%/);
  assert.match(css, /\.scene-copy h1\{[^}]*font-size:clamp\(2\.1rem,6vw,4\.5rem\)/);
  assert.match(css, /\.scene-identity-tags\{[^}]*grid-template-columns:repeat\(4,max-content\)/);
});

test('header CTA is a GitHub jump, not the old mail link', () => {
  assert.doesNotMatch(html, /聊聊想法/);
  assert.doesNotMatch(html, /header-mail/);
  assert.match(html, /class="header-github"[^>]*href="https:\/\/github\.com\/Jenrimark"/);
  assert.match(html, /class="header-github"[^>]*target="_blank"/);
  assert.match(css, /\.header-github\{/);
});

test('footer is a plain Heo-style bar with no links and no status light', () => {
  assert.match(html, /class="site-footer"/);
  assert.match(html, /Design &amp; Build with ❤ by Jenrimark/);
  assert.doesNotMatch(html, /Powered by/);
  assert.match(html, /Copyright © 2026 吴汉东/);
  assert.match(html, /CC BY-NC-SA 4\.0/);
  assert.match(html, /蜀ICP备 2026055157 号/);
  assert.match(html, /鄂公网安备 42018502009413 号/);
  assert.doesNotMatch(html, /status-light/);
  // Plain text only: no anchors and no police-shield badge in the footer.
  const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || '';
  assert.doesNotMatch(footer, /<a\s/);
  assert.doesNotMatch(html, /police-badge/);
  assert.doesNotMatch(html, /beian\.miit\.gov\.cn/);
  assert.doesNotMatch(html, /beian\.mps\.gov\.cn/);
  assert.match(css, /\.site-footer\{[^}]*background:transparent/);
  assert.doesNotMatch(css, /status-light/);
  assert.doesNotMatch(css, /status-pulse/);
});

test('footer stays hidden until the final contact scene', () => {
  assert.match(page, /siteFooter\?\.classList\.toggle\('is-visible',\s*next\.id==='contact'\)/);
  assert.match(css, /\.site-footer\{[^}]*opacity:0/);
  assert.match(css, /\.site-footer\.is-visible\{[^}]*opacity:1/);
});
