import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { boardId, cleanBoardName, DEFAULT_BOARD, EMPTY_BOARD, MAX_BOARDS, validateBoard } from '../../shared/board.ts';
import { boardList, getBoard, importExtras, putBoard, removeBoard, savedBoards } from '../boards.ts';
import { kvSet } from '../db.ts';
import { sealBoard } from '../sealwidgets.ts';
import type { Board } from '../../shared/board.ts';

const named = (name: string) => ({ ...EMPTY_BOARD, name });
const errorOf = (r: object) => ('error' in r ? String(r.error) : '');

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

  assert.ok('board' in putBoard('media', named('Media')));
  assert.ok('board' in putBoard('ops', named('Server room')));
  assert.ok('board' in putBoard('home', named('Front')));
  assert.deepEqual(boardList(), [
    { id: 'home', name: 'Front' },
    { id: 'media', name: 'Media' },
    { id: 'ops', name: 'Server room' },
  ]);
  assert.deepEqual(
    savedBoards().map((b) => b.id),
    ['home', 'media', 'ops'],
  );
  assert.match(errorOf(putBoard('Bad Id', named('x'))), /lowercase/);

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
  for (let i = 1; i < MAX_BOARDS; i++) assert.ok('board' in putBoard(`b-${i}`, named(`B ${i}`)));
  assert.match(errorOf(putBoard('one-more', named('One more'))), /At most/);
  assert.ok('board' in putBoard('b-1', named('Renamed')), 'saving an existing board still works at the ceiling');
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

test('keys typed into an API widget move to the key store; references and plain values stay', () => {
  const saved: Record<string, string> = {};
  const save = (n: string, v: string) => void (saved[n] = v);
  const widget = (cfg: object) => ({ ...EMPTY_BOARD, widgets: [...EMPTY_BOARD.widgets, { id: 'api-1', type: 'json' as const, size: 's' as const, config: { json: JSON.stringify({ title: 'T', interval: 60, fields: [{ label: 'n', path: 'n', format: 'number' }], ...cfg }) } }] });
  const cfgOf = (b: Board) => JSON.parse(b.widgets.find((w) => w.id === 'api-1')!.config!.json);

  const b = sealBoard(
    'home',
    widget({
      url: 'https://me:hunter2@nas.lan/api/stats?apikey=abc123&page=2',
      headers: { Authorization: 'Bearer eyJ.abc.def', 'X-Api-Key': 'k-555', Accept: 'application/json', 'X-Plex-Token': '${secret:PLEX}' },
    }),
    save,
  );
  const c = cfgOf(b);
  assert.equal(c.url, 'https://me:${secret:W_HOME_API_1_PASSWORD}@nas.lan/api/stats?apikey=${secret:W_HOME_API_1_APIKEY}&page=2');
  assert.equal(c.headers.Authorization, 'Bearer ${secret:W_HOME_API_1_AUTHORIZATION}');
  assert.equal(c.headers['X-Api-Key'], '${secret:W_HOME_API_1_X_API_KEY}');
  assert.equal(c.headers.Accept, 'application/json', 'not a credential');
  assert.equal(c.headers['X-Plex-Token'], '${secret:PLEX}', 'already a reference');
  assert.deepEqual(saved, { W_HOME_API_1_PASSWORD: 'hunter2', W_HOME_API_1_APIKEY: 'abc123', W_HOME_API_1_AUTHORIZATION: 'eyJ.abc.def', W_HOME_API_1_X_API_KEY: 'k-555' });
  assert.ok(!JSON.stringify(b).includes('hunter2') && !JSON.stringify(b).includes('eyJ'), 'nothing secret left in the board');

  const plain = widget({ url: 'https://api.example.org/v1/stats', headers: {} });
  assert.equal(sealBoard('home', plain, save), plain, 'a board with nothing to move comes back as it was');
});

test('TrueNAS reads Check the certificate from Settings like every other integration', async () => {
  const { withConfig, config } = await import('../config.ts');
  const on = await withConfig({ TRUENAS_API_KEY: 'k', TRUENAS_VERIFY_TLS: '1' }, async () => config.truenas?.verifyTls);
  const off = await withConfig({ TRUENAS_API_KEY: 'k' }, async () => config.truenas?.verifyTls);
  assert.equal(on, true);
  assert.equal(off, false);
});


test('widget placement survives saving and importing without changing legacy boards', () => {
  const v = validateBoard({ ...DEFAULT_BOARD, widgets: DEFAULT_BOARD.widgets.map((w) => ({ ...w, column: 3 })) });
  assert.ok('board' in v);
  assert(v.board.widgets.every((w) => w.column === 3));
  const invalid = validateBoard({ ...DEFAULT_BOARD, widgets: DEFAULT_BOARD.widgets.map((w) => ({ ...w, column: 99 })) });
  assert.ok('board' in invalid);
  assert(invalid.board.widgets.every((w) => w.column === undefined));
  assert.deepEqual(validateBoard(DEFAULT_BOARD), { board: DEFAULT_BOARD });
});

test('a wall board says so in the board list, so Home leaves it out of its tabs', () => {
  putBoard('hall-clock', { ...named('Hall clock'), wall: true });
  putBoard('office', named('Office'));
  const list = boardList();
  assert.equal(list.find((b) => b.id === 'hall-clock')?.wall, true);
  assert.equal(list.find((b) => b.id === 'office')?.wall, undefined);
  removeBoard('hall-clock');
  removeBoard('office');
});

test('the UPS in one reading: the one in trouble first, its words in the page language', async () => {
  const { headlineUps, upsLabel, upsLevel } = await import('../../shared/ups.ts');
  const base = { model: '', lowBattery: false, replaceBattery: false, charging: false };
  const mains = { ...base, name: 'desk', onBattery: false, charge: 100 };
  const out = { ...base, name: 'rack', onBattery: true, charge: 64, runtimeSec: 23 * 60 };
  assert.equal(headlineUps([mains, out])?.name, 'rack');
  assert.equal(headlineUps([]), undefined);
  assert.equal(upsLabel(out), 'On battery, 23 min left');
  assert.equal(upsLabel(mains), 'UPS');
  assert.equal(upsLevel(out), 'crit');
  assert.equal(upsLevel(mains), 'ok');
});
