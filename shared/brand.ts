// The name in the header and the tab, checked the same way on both sides.

import type { Brand } from './types.ts';

/** A name for the header: plain text, one line, 40 characters at most. */
export function cleanBrand(raw: unknown): Brand | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Expected a name' };
  const r = raw as Record<string, unknown>;
  if (r.name != null && typeof r.name !== 'string') return { error: 'The name must be text' };
  const name = ((r.name as string | undefined) ?? '').replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length > 40) return { error: 'Keep the name to 40 characters' };
  return name ? { name } : {};
}
