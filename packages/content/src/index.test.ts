import test from 'node:test';
import assert from 'node:assert/strict';
import { homeViewModel, publicContent, safeURL, validateContent, type SiteContent } from './index.ts';

const base: SiteContent = {
  profile: { name: 'Jenrimark' },
  projects: [
    { id: 'a', slug: 'a', title: 'A', status: 'published', sortOrder: 2 },
    { id: 'b', slug: 'b', title: 'B', status: 'draft', sortOrder: 1 },
    { id: 'c', slug: 'c', title: 'C', status: 'published', sortOrder: 0 },
  ],
  homeSlots: { featured_1: 'c', featured_2: 'a' },
};

test('publicContent excludes draft projects without mutating source', () => {
  const next = publicContent(base);
  assert.deepEqual(next.projects.map((project) => project.id), ['c', 'a']);
  assert.equal(base.projects.length, 3);
});

test('homeViewModel honors manual slots and removes featured duplicates from minis', () => {
  const view = homeViewModel(base);
  assert.deepEqual(view.featuredProjects.map((project) => project.id), ['c', 'a']);
  assert.deepEqual(view.miniProjects.map((project) => project.id), []);
});

test('homeViewModel can include drafts for protected preview without changing public filtering', () => {
  const preview = homeViewModel(base, { includeDraft: true });
  const publicView = homeViewModel(base);
  assert.equal(preview.projects.length, 3);
  assert.equal(publicView.projects.length, 2);
  assert.equal(preview.projects.some((project) => project.status === 'draft'), true);
});

test('publicContent removes home slots that point to draft projects', () => {
  const next = publicContent({ ...base, homeSlots: { featured_1: 'b', featured_2: 'a' } });
  assert.deepEqual(next.homeSlots, { featured_2: 'a' });
});

test('safeURL accepts mailto and media paths but rejects traversal', () => {
  assert.equal(safeURL('mailto:hello@example.com'), 'mailto:hello@example.com');
  assert.equal(safeURL('/media/uploads/a.png'), '/media/uploads/a.png');
  assert.equal(safeURL('media/../secret'), '');
});

test('validateContent rejects duplicate home slot references', () => {
  assert.throws(() => validateContent({ ...base, homeSlots: { featured_1: 'a', mini_1: 'a' } }), /multiple home slots/);
});

test('validateContent rejects unsafe project links and rich text marks', () => {
  assert.throws(() => validateContent({ ...base, projects: [{ ...base.projects[0], sourceUrl: 'javascript:alert(1)' }] }), /source URL/);
  assert.throws(() => validateContent({ ...base, projects: [{ ...base.projects[0], blocks: [{ id: 'x', type: 'rich_text', sortOrder: 0, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } }] }] }), /rich text link/);
});
