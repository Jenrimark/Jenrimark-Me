import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('homepage exposes the six portal destinations as an icon dock', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const expected = [
    ['聚合引擎', 'https://jenrimark.github.io/view/'],
    ['作品集', '#work'],
    ['联系我', '#contact'],
    ['履历书', 'https://jenrimark.github.io/acad-homepage/'],
    ['知识库', 'https://fcn9od35aepq.feishu.cn/wiki/R1R3wPuzTioFtNkOnELcUJJLnBh?from=from_copylink'],
    ['GitHub', 'https://github.com/Jenrimark'],
  ];

  assert.match(html, /class="portal-dock"/);
  for (const [label, href] of expected) {
    assert.ok(html.includes(`href="${href}"`), `missing href for ${label}`);
    assert.ok(html.includes(`<span>${label}</span>`), `missing visible label ${label}`);
  }
  assert.equal((html.match(/class="portal-link/g) || []).length, expected.length);
});

test('portal dock has responsive sticker styling and reduced-motion support', async () => {
  const css = await readFile(new URL('page.css', root), 'utf8');

  assert.match(css, /\.portal-dock\s*\{/);
  assert.match(css, /\.portal-link\s*\{/);
  assert.match(css, /\.portal-icon\s*\{/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('portal dock expands only for the first and final scenes', async () => {
  const script = await readFile(new URL('page.mjs', root), 'utf8');
  const css = await readFile(new URL('page.css', root), 'utf8');

  assert.match(script, /portalDock\?\.classList\.toggle\('is-expanded',\s*next\.id==='about'\|\|next\.id==='contact'\)/);
  assert.match(css, /\.portal-dock:not\(\.is-expanded\)\s+\.portal-link>span:not\(\.portal-icon\)/);
  assert.match(css, /\.portal-dock:not\(\.is-expanded\)\s*\{/);
  assert.match(css, /top:96px/);
  assert.match(css, /\.portal-dock\{top:96px;right:[^;]+;bottom:auto/);
});

test('collapsed portal dock stays compact in the upper-right corner', async () => {
  const css = await readFile(new URL('page.css', root), 'utf8');

  assert.match(css, /\.portal-dock:not\(\.is-expanded\)\{gap:4px;width:38px\}/);
  assert.match(css, /\.portal-dock:not\(\.is-expanded\) \.portal-link\{[^}]*width:34px;[^}]*min-height:34px/);
  assert.match(css, /\.portal-dock:not\(\.is-expanded\) \.portal-icon\{width:26px;height:26px;font-size:15px\}/);
  assert.match(css, /\.portal-dock\{top:96px;/);
});
