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
