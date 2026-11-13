// Where boards live. Home stays under the `board` key it always had, so an
// older setup keeps working; the boards added after it live under `boards`,
// in the order their tabs show.

import { type Board, type BoardRef, BOARD_ID, DEFAULT_BOARD, HOME_ID, MAX_BOARDS, validateBoard } from '../shared/board.ts';
import { kvGet, kvSet } from './db.ts';
import { sealBoard } from './sealwidgets.ts';

interface Stored {
  id: string;
  board: Board;
}

function valid(raw: unknown): Board | null {
  const v = raw ? validateBoard(raw) : null;
  return v && 'board' in v ? v.board : null;
}

function extras(): Stored[] {
  const raw = kvGet<unknown>('boards');
  if (!Array.isArray(raw)) return [];
  const out: Stored[] = [];
  for (const s of raw as Partial<Stored>[]) {
    const board = valid(s?.board);
    if (typeof s?.id === 'string' && BOARD_ID.test(s.id) && s.id !== HOME_ID && board) out.push({ id: s.id, board });
  }
  return out;
}

/** Home's board as saved, or null while it is still the default. */
export function savedHome(): Board | null {
  return valid(kvGet<unknown>('board'));
}

/** One board, or null for an address that has none. Home is never missing. */
export function getBoard(id: string): { board: Board; custom: boolean } | null {
  if (id === HOME_ID) {
    const saved = savedHome();
    return { board: saved ?? DEFAULT_BOARD, custom: !!saved };
  }
  const found = extras().find((s) => s.id === id);
  return found ? { board: found.board, custom: true } : null;
}

/** Every saved board, Home first, for the server's own lookups (pinned entities, API widgets). */
export function savedBoards(): { id: string; board: Board }[] {
  const home = savedHome();
  return [...(home ? [{ id: HOME_ID, board: home }] : []), ...extras()];
}

/** The tabs: each board's address and name. */
export function boardList(): BoardRef[] {
  return [{ id: HOME_ID, name: savedHome()?.name ?? 'Home' }, ...extras().map((s) => ({ id: s.id, name: s.board.name ?? s.id, ...(s.board.wall ? { wall: true } : {}) }))];
}

/**
 * Save a board, adding it when the address is new. Keys typed into its
 * widgets move to the key store first. The board as stored, or why not.
 */
export function putBoard(id: string, input: Board): { board: Board } | { error: string } {
  if (!BOARD_ID.test(id)) return { error: 'A board address is lowercase letters, digits and dashes' };
  const all = extras();
  const at = all.findIndex((s) => s.id === id);
  if (id !== HOME_ID && at < 0 && all.length + 1 >= MAX_BOARDS) return { error: `At most ${MAX_BOARDS} boards` };
  const board = sealBoard(id, input);
  if (id === HOME_ID) {
    kvSet('board', board);
    return { board };
  }
  if (at < 0) all.push({ id, board });
  else all[at] = { id, board };
  kvSet('boards', all);
  return { board };
}

/** Boards saved before keys were moved out of widgets: move them now. */
export function sealSavedBoards(): void {
  const home = savedHome();
  if (home) {
    const sealed = sealBoard(HOME_ID, home);
    if (sealed !== home) kvSet('board', sealed);
  }
  const all = extras();
  const sealed = all.map((s) => ({ id: s.id, board: sealBoard(s.id, s.board) }));
  if (sealed.some((s, i) => s.board !== all[i].board)) kvSet('boards', sealed);
}

/** Reset Home to the default, or delete another board. False when there was nothing to delete. */
export function removeBoard(id: string): boolean {
  if (id === HOME_ID) {
    kvSet('board', null);
    return true;
  }
  const all = extras();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  kvSet('boards', next);
  // Its Notes widgets' text goes with it.
  const notes = kvGet<Record<string, unknown>>('board-notes');
  if (notes) kvSet('board-notes', Object.fromEntries(Object.entries(notes).filter(([k]) => !k.startsWith(`${id}.`))));
  return true;
}

/** The boards after Home, for a setup export. */
export function exportExtras(): Stored[] {
  return extras();
}

/** Replace the boards after Home from a setup file. An error message when the file's are bad. */
export function importExtras(raw: unknown): { boards: Stored[] } | { error: string } {
  if (raw == null) return { boards: [] };
  if (!Array.isArray(raw) || raw.length >= MAX_BOARDS) return { error: `Expected up to ${MAX_BOARDS - 1} boards` };
  const out: Stored[] = [];
  for (const s of raw as Partial<Stored>[]) {
    if (typeof s?.id !== 'string' || !BOARD_ID.test(s.id) || s.id === HOME_ID || out.some((x) => x.id === s.id)) return { error: `Bad board address ${String(s?.id).slice(0, 40)}` };
    const v = validateBoard(s.board);
    if ('error' in v) return { error: `${s.id}: ${v.error}` };
    out.push({ id: s.id, board: v.board });
  }
  return { boards: out };
}

export function saveExtras(boards: Stored[]): void {
  kvSet('boards', boards.length ? boards.map((s) => ({ id: s.id, board: sealBoard(s.id, s.board) })) : null);
}

/** Home from a setup file, or back to the default with null. */
export function saveHome(board: Board | null): void {
  kvSet('board', board ? sealBoard(HOME_ID, board) : null);
}
