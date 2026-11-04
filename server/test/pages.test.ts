import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { arrange, validatePages } from '../../shared/pages.ts';

test('arrange hides and orders sections, keeping unlisted ones in default order', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(arrange(ids, undefined), ids);
  assert.deepEqual(arrange(ids, { order: ['c', 'a'], hidden: ['b'] }), ['c', 'a', 'd']);
});

test('validatePages accepts known pages and string lists only', () => {
  assert.ok('pages' in validatePages({ feeds: { hideFeeds: ['Hacker News'] }, server: { hidden: ['disks'] } }));
  assert.ok('error' in validatePages({ secrets: {} }));
  assert.ok('error' in validatePages({ feeds: { hideFeeds: [1] } }));
  assert.ok('error' in validatePages([]));
  const v = validatePages({ stacks: { hideStacks: ['media', 'media'], extra: ['x'] } });
  assert.ok('pages' in v && v.pages.stacks?.hideStacks?.length === 1 && !('extra' in v.pages.stacks!));
});
