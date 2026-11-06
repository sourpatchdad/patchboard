import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { boardId, cleanBoardName, DEFAULT_BOARD, EMPTY_BOARD, MAX_BOARDS, validateBoard } from '../../shared/board.ts';
import { boardList, getBoard, importExtras, putBoard, removeBoard, savedBoards } from '../boards.ts';
import { kvSet } from '../db.ts';

const named = (name: string) => ({ ...EMPTY_BOARD, name });

test('board names and addresses', () => {
  assert.equal(cleanBoardName('  Server \u0007 room  '), 'Server room');
  assert.equal(cleanBoardName('   '), undefined);
  assert.equal(cleanBoardName(42), undefined);
  assert.equal(cleanBoardName('x'.repeat(50))?.length, 32);
  assert.equal(boardId('Media night', []), 'media-night');
  assert.equal(boardId('Media', ['home', 'media']), 'media-2');
  assert.equal(boardId('Home', ['home']), 'home-2', 'Home stays the first board');
  assert.equal(boardId('🍿', []), 'board');
});

test('a name and fit survive validation; junk does not', () => {
  const v = validateBoard({ ...DEFAULT_BOARD, name: ' Wall ', fit: true });
  assert.ok('board' in v);
  assert.equal(v.board.name, 'Wall');
  assert.equal(v.board.fit, true);
  const w = validateBoard({ ...DEFAULT_BOARD, name: 7, fit: 'yes' });
  assert.ok('board' in w);
  assert.equal(w.board.name, undefined);
  assert.equal(w.board.fit, undefined);
});

test('Home is always there; other boards come and go, in order', () => {
  kvSet('board', null);
  kvSet('boards', null);
  assert.deepEqual(boardList(), [{ id: 'home', name: 'Home' }]);
  assert.deepEqual(getBoard('home'), { board: DEFAULT_BOARD, custom: false });
  assert.equal(getBoard('media'), null);

  assert.equal(putBoard('media', named('Media')), null);
  assert.equal(putBoard('ops', named('Server room')), null);
  assert.equal(putBoard('home', named('Front')), null);
  assert.deepEqual(boardList(), [
    { id: 'home', name: 'Front' },
    { id: 'media', name: 'Media' },
    { id: 'ops', name: 'Server room' },
  ]);
  assert.deepEqual(
    savedBoards().map((b) => b.id),
    ['home', 'media', 'ops'],
  );
  assert.match(putBoard('Bad Id', named('x')) ?? '', /lowercase/);

  assert.equal(removeBoard('media'), true);
  assert.equal(removeBoard('media'), false);
  assert.equal(removeBoard('home'), true, 'Home resets');
  assert.deepEqual(getBoard('home'), { board: DEFAULT_BOARD, custom: false });
  assert.deepEqual(boardList(), [
    { id: 'home', name: 'Home' },
    { id: 'ops', name: 'Server room' },
  ]);
  kvSet('boards', null);
});

test('there is a ceiling on boards', () => {
  kvSet('boards', null);
  for (let i = 1; i < MAX_BOARDS; i++) assert.equal(putBoard(`b-${i}`, named(`B ${i}`)), null);
  assert.match(putBoard('one-more', named('One more')) ?? '', /At most/);
  assert.equal(putBoard('b-1', named('Renamed')), null, 'saving an existing board still works at the ceiling');
  kvSet('boards', null);
});

test('a setup file brings its boards, or is refused whole', () => {
  const ok = importExtras([{ id: 'media', board: named('Media') }]);
  assert.ok('boards' in ok && ok.boards.length === 1);
  assert.ok('error' in importExtras([{ id: 'home', board: named('x') }]), 'Home travels as board, not boards');
  assert.ok('error' in importExtras([{ id: 'a', board: named('A') }, { id: 'a', board: named('B') }]));
  assert.ok('error' in importExtras([{ id: 'a', board: { widgets: [{ type: 'nope' }] } }]));
  assert.deepEqual(importExtras(undefined), { boards: [] });
});
