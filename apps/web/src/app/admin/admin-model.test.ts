import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneContent, emptyProject, updateArrayItem, updatePath } from './admin-model.ts';

const base = {
  profile: { name: '吴汉东', positioning: 'AI 产品与全栈开发' },
  projects: [],
};

test('updatePath changes a nested object without mutating the source', () => {
  const next = updatePath(base, 'profile', 'name', 'Jenrick Wu');

  assert.equal(next.profile.name, 'Jenrick Wu');
  assert.equal(base.profile.name, '吴汉东');
  assert.notEqual(next.profile, base.profile);
});

test('updateArrayItem replaces only the requested array item', () => {
  const source = [{ title: 'A' }, { title: 'B' }];
  const next = updateArrayItem(source, 1, { title: 'C' });

  assert.deepEqual(next, [{ title: 'A' }, { title: 'C' }]);
  assert.deepEqual(source, [{ title: 'A' }, { title: 'B' }]);
});

test('cloneContent creates an editable copy', () => {
  const copy = cloneContent(base);
  copy.profile.name = '编辑后的名字';

  assert.equal(base.profile.name, '吴汉东');
});

test('emptyProject creates a draft with editable collections', () => {
  const project = emptyProject();

  assert.equal(project.status, 'draft');
  assert.deepEqual(project.technologies, []);
  assert.deepEqual(project.highlights, []);
  assert.deepEqual(project.flow, []);
});
